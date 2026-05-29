from werkzeug.exceptions import HTTPException


def register_error_handlers(app):
    @app.errorhandler(HTTPException)
    def handle_http_error(error):
        response = error.get_response()
        response.data = app.json.dumps(
            {
                "error": error.name,
                "message": error.description,
                "status_code": error.code,
            }
        )
        response.content_type = "application/json"
        return response

    @app.errorhandler(Exception)
    def handle_unexpected_error(error):
        app.logger.exception("Unhandled application error")
        return {
            "error": "Internal Server Error",
            "message": "An unexpected server error occurred.",
            "status_code": 500,
        }, 500
