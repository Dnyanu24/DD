from flask import Blueprint, current_app, jsonify


health_bp = Blueprint("health", __name__)


@health_bp.get("/health")
def health_check():
    return jsonify(
        {
            "status": "ok",
            "service": current_app.config.get("APP_NAME", "SDAS"),
            "architecture": "flask-modular-pipeline",
        }
    )


@health_bp.get("/")
def api_root():
    return jsonify({"message": "SDAS Flask API foundation running"})
