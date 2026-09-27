from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(docs_url="/api/docs", openapi_url="/api/openapi.json")

class OptimizationRequest(BaseModel):
    session_id: str

@app.post("/api/optimize")
def optimize_fleet(req: OptimizationRequest):
    return {
        "status": "success",
        "session_id": req.session_id,
        "message": "Model PuLP akan diolah di sini"
    }