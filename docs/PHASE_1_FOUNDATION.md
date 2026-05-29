# SDAS Phase 1 - Foundation

This phase adds the Flask foundation requested for SDAS while preserving the existing working backend modules.

## Architecture

- `Backend/app.py` is the Flask entrypoint.
- `Backend/config.py` centralizes environment-driven configuration.
- `Backend/app/__init__.py` exposes the Flask application factory.
- `Backend/app/routes/` contains Flask blueprints.
- `Backend/app/utils/` contains shared logging and error middleware.
- `Backend/app/agents/` and `Backend/app/pipelines/` are reserved for later SDAS phases.
- `Backend/app/services/` keeps the existing intelligent data services.
- `Backend/app/reports/` is the generated report output area.

## Run

```powershell
cd Backend
python app.py
```

Health check:

```text
GET http://127.0.0.1:8000/api/health
```

## Notes

The current FastAPI implementation is not deleted yet. It contains working upload, analysis, reports, dashboard, and auth features that should be migrated phase-by-phase instead of removed blindly.
