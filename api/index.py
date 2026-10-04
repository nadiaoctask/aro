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

def make_var(prob, name, low, up):
    if hasattr(prob, "add_variable"):  
        return prob.add_variable(name, low, up, cat='Integer')
    return pulp.LpVariable(name, lowBound=low, upBound=up, cat='Integer')

@app.post("/api/optimize")
def optimize_fleet(payload: OptimizeRequest):
    remaining_items = {item.material_id: item for item in payload.items if item.boxes_needed > 0}
    results = []
    
    for fleet in payload.fleets:
        if not remaining_items:
            break
            
        prob = pulp.LpProblem(f"Optimize_{fleet.license_plate.replace(' ', '_')}", pulp.LpMaximize)

        qty = {}
        objective_terms = []

        for mid, item in remaining_items.items():
            safe = mid.replace('-', '_').replace(' ', '_')
            rem = item.boxes_needed
            m = min(half_pallet_boxes(item.pcs_per_pal, item.pcs_per_box), rem)
            can_split = rem >= 2 * m

            qty[mid] = make_var(prob, f"q_{safe}", 0, rem)
            y_full = make_var(prob, f"yfull_{safe}", 0, 1)
            y_part = make_var(prob, f"ypart_{safe}", 0, 1 if can_split else 0)

            prob += y_full + y_part <= 1
            prob += qty[mid] >= m * y_part + rem * y_full
            prob += qty[mid] <= (rem - m) * y_part + rem * y_full

            priority = 100.0 / (item.x_days + 0.1)
            objective_terms.append(priority * qty[mid])
            objective_terms.append(priority * COVERAGE_WEIGHT * m * (y_full + y_part))

        prob += pulp.lpSum(objective_terms), "Maximize_Priority_and_Coverage"

        prob += pulp.lpSum([remaining_items[mid].weight_per_box * qty[mid] for mid in remaining_items]) <= fleet.weight_capacity, "Weight"
        prob += pulp.lpSum([remaining_items[mid].volume_per_box * qty[mid] for mid in remaining_items]) <= fleet.volume_capacity, "Volume"

        prob.solve()
        
        loaded_items = []
        total_weight = 0.0
        total_volume = 0.0
        
        for mid, item in remaining_items.items():
            qty_loaded = int(round(qty[mid].varValue or 0))
            
            if qty_loaded > 0:
                item_weight = qty_loaded * item.weight_per_box
                item_volume = qty_loaded * item.volume_per_box
                
                loaded_items.append({
                    "material_id": mid,
                    "description": item.description,
                    "qty_loaded_boxes": qty_loaded,
                    "weight_subtotal": round(item_weight, 2),
                    "volume_subtotal": round(item_volume, 2)
                })
                
                total_weight += item_weight
                total_volume += item_volume
                
                remaining_items[mid].boxes_needed -= qty_loaded
                
        remaining_items = {mid: item for mid, item in remaining_items.items() if item.boxes_needed > 0}
        
        if loaded_items:
            results.append({
                "selectionId": fleet.selectionId,
                "license_plate": fleet.license_plate,
                "shipp_type": fleet.shipp_type,
                "ritase": fleet.ritase,
                "total_weight": round(total_weight, 2),
                "total_volume": round(total_volume, 4),
                "weight_capacity": fleet.weight_capacity,
                "volume_capacity": fleet.volume_capacity,
                "utilization_weight_pct": round((total_weight / fleet.weight_capacity) * 100, 2) if fleet.weight_capacity else 0,
                "utilization_volume_pct": round((total_volume / fleet.volume_capacity) * 100, 2) if fleet.volume_capacity else 0,
                "items": loaded_items
            })
            
    unassigned_items = []
    unassigned_total_weight = 0.0
    unassigned_total_volume = 0.0
    
    for mid, item in remaining_items.items():
        weight = item.boxes_needed * item.weight_per_box
        volume = item.boxes_needed * item.volume_per_box
        unassigned_total_weight += weight
        unassigned_total_volume += volume
        
        unassigned_items.append({
            "material_id": mid,
            "description": item.description,
            "boxes_left": item.boxes_needed,
            "weight_left": round(weight, 2),
            "volume_left": round(volume, 4)
        })
        
    return {
        "status": "success",
        "optimized_fleets": results,
        "unassigned": {
            "total_weight": round(unassigned_total_weight, 2),
            "total_volume": round(unassigned_total_volume, 4),
            "items": unassigned_items
        }
    }