from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import pulp
import math

app = FastAPI(docs_url="/api/docs", openapi_url="/api/openapi.json")

class Item(BaseModel):
    material_id: str
    description: str
    x_days: float
    boxes_needed: int
    weight_per_box: float
    volume_per_box: float
    pcs_per_pal: float = 1
    pcs_per_box: float = 1

class Fleet(BaseModel):
    license_plate: str
    shipp_type: str
    weight_capacity: float
    volume_capacity: float
    selectionId: str | None = None
    ritase: int = 1

class OptimizeRequest(BaseModel):
    items: List[Item]
    fleets: List[Fleet]

COVERAGE_WEIGHT = 1000 

def half_pallet_boxes(pcs_per_pal, pcs_per_box):
    pcs_per_pal = pcs_per_pal or 1
    pcs_per_box = pcs_per_box or 1
    return max(1, math.ceil((pcs_per_pal / pcs_per_box) / 2))

def make_var(prob, name, low, up, cat='Integer'):
    if hasattr(prob, "add_variable"):
        return prob.add_variable(name, low, up, cat=cat)
    return pulp.LpVariable(name, lowBound=low, upBound=up, cat=cat)

@app.post("/api/optimize")
def optimize_fleet(payload: OptimizeRequest):
    items = {i.material_id: i for i in payload.items if i.boxes_needed > 0}
    fleets = payload.fleets
    F = range(len(fleets))
    single_fleet = len(fleets) == 1

    def fits_single(item):
        return any(
            item.boxes_needed * item.weight_per_box <= fl.weight_capacity
            and item.boxes_needed * item.volume_per_box <= fl.volume_capacity
            for fl in fleets
        )

    splittable = {mid for mid, it in items.items() if single_fleet or not fits_single(it)}

    prob = pulp.LpProblem("Optimize_All_Fleets", pulp.LpMaximize)

    x = {}      # MID tidak boleh pecah: 1 kalau diangkut utuh di fleet f
    k = {}      # MID boleh pecah: jumlah paket 1/2 palet di fleet f
    t = {}      # MID boleh pecah: sisa non-kelipatan (tail) ditaruh di fleet f
    qty = {}    
    unit = {}
    objective_terms = []

    for mid, item in items.items():
        safe = mid.replace('-', '_').replace(' ', '_')
        rem = item.boxes_needed
        u = half_pallet_boxes(item.pcs_per_pal, item.pcs_per_box)
        unit[mid] = u
        priority = 100.0 / (item.x_days + 0.1)

        if mid not in splittable:
            for f in F:
                x[mid, f] = make_var(prob, f"x_{safe}_{f}", 0, 1)
                qty[mid, f] = rem * x[mid, f]
            assigned = pulp.lpSum(x[mid, f] for f in F)
            prob += assigned <= 1, f"OneFleet_{safe}"
            objective_terms.append(priority * (rem + COVERAGE_WEIGHT * min(u, rem)) * assigned)
        else:
            units = rem // u
            tail = rem % u

            y_tail = make_var(prob, f"ytail_{safe}", 0, 1 if tail > 0 else 0)
            z = make_var(prob, f"z_{safe}", 0, 1)

            for f in F:
                k[mid, f] = make_var(prob, f"k_{safe}_{f}", 0, units)
                t[mid, f] = make_var(prob, f"t_{safe}_{f}", 0, 1 if tail > 0 else 0)
                qty[mid, f] = u * k[mid, f] + tail * t[mid, f]

            sum_k = pulp.lpSum(k[mid, f] for f in F)
            prob += sum_k <= units, f"MaxUnits_{safe}"
            prob += pulp.lpSum(t[mid, f] for f in F) == y_tail, f"TailOnce_{safe}"
            prob += sum_k >= units * y_tail, f"TailAfterAll_{safe}"   # tail hanya kalau semua unit terangkut
            prob += z <= sum_k + y_tail, f"Cover_{safe}"

            total_qty = u * sum_k + tail * y_tail
            objective_terms.append(priority * total_qty)
            objective_terms.append(priority * COVERAGE_WEIGHT * min(u, rem) * z)

    prob += pulp.lpSum(objective_terms), "Maximize_Priority_and_Coverage"

    for f, fleet in enumerate(fleets):
        prob += pulp.lpSum(items[mid].weight_per_box * qty[mid, f] for mid in items) <= fleet.weight_capacity, f"Weight_{f}"
        prob += pulp.lpSum(items[mid].volume_per_box * qty[mid, f] for mid in items) <= fleet.volume_capacity, f"Volume_{f}"

    prob.solve()

    results = []
    loaded_total = {mid: 0 for mid in items}

    for f, fleet in enumerate(fleets):
        loaded_items = []
        total_weight = total_volume = total_pallets = 0.0

        for mid, item in items.items():
            if mid in splittable:
                u_ = unit[mid]
                tail_ = item.boxes_needed % u_
                qty_loaded = (int(round(k[mid, f].varValue or 0)) * u_
                            + int(round(t[mid, f].varValue or 0)) * tail_)
            else:
                qty_loaded = item.boxes_needed if (x[mid, f].varValue or 0) > 0.5 else 0
            
            if qty_loaded <= 0:
                continue

            boxes_per_pal = (item.pcs_per_pal or 1) / (item.pcs_per_box or 1)
            w = qty_loaded * item.weight_per_box
            v = qty_loaded * item.volume_per_box

            
            loaded_items.append({
                "material_id": mid,
                "description": item.description,
                "qty_loaded_boxes": qty_loaded,
                "qty_loaded_pallets": round(qty_loaded / boxes_per_pal, 2),
                "weight_subtotal": round(w, 2),
                "volume_subtotal": round(v, 2)
            })
            total_weight += w
            total_volume += v
            total_pallets += qty_loaded / boxes_per_pal
            loaded_total[mid] += qty_loaded

        if loaded_items:
            results.append({
                "selectionId": fleet.selectionId,
                "license_plate": fleet.license_plate,
                "shipp_type": fleet.shipp_type,
                "ritase": fleet.ritase,
                "total_weight": round(total_weight, 2),
                "total_volume": round(total_volume, 4),
                "total_pallets": round(total_pallets, 2),
                "weight_capacity": fleet.weight_capacity,
                "volume_capacity": fleet.volume_capacity,
                "utilization_weight_pct": round(total_weight / fleet.weight_capacity * 100, 2) if fleet.weight_capacity else 0,
                "utilization_volume_pct": round(total_volume / fleet.volume_capacity * 100, 2) if fleet.volume_capacity else 0,
                "items": loaded_items
            })

    unassigned_items = []
    uw = uv = 0.0
    for mid, item in items.items():
        left = item.boxes_needed - loaded_total[mid]
        if left <= 0:
            continue
        w = left * item.weight_per_box
        v = left * item.volume_per_box
        uw += w
        uv += v
        unassigned_items.append({
            "material_id": mid,
            "description": item.description,
            "boxes_left": left,
            "weight_left": round(w, 2),
            "volume_left": round(v, 4)
        })

    return {
        "status": "success",
        "optimized_fleets": results,
        "unassigned": {
            "total_weight": round(uw, 2),
            "total_volume": round(uv, 4),
            "items": unassigned_items
        }
    }