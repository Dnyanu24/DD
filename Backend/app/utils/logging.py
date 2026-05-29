import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path


def configure_logging(app):
    log_dir = Path(app.root_path).parent / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s [%(name)s] %(message)s"
    )

    file_handler = RotatingFileHandler(
        log_dir / "sdas.log",
        maxBytes=5_000_000,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.INFO)

    if not any(isinstance(handler, RotatingFileHandler) for handler in app.logger.handlers):
        app.logger.addHandler(file_handler)

    app.logger.setLevel(logging.INFO)
