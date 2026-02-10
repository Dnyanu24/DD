from fastapi import APIRouter

router = APIRouter()

@router.get("/predict")
def predict():
    return {"prediction": "Sales likely to increase next quarter"}

@router.get("/recommend")
def recommend():
    return {"recommendation": "Focus on high-performing clusters"}

@router.get("/risk")
def detect_risk():
    return {"risk": "Anomaly detected in recent data"}

@router.get("/summary")
def summary():
    return {"summary": "Overall performance is stable with minor risks"}
