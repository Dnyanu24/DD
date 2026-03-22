# Make `Backend/app` an explicit Python package so `import app...` works reliably
# when `Backend` is on `PYTHONPATH` / provided to Uvicorn via `--app-dir Backend`.

