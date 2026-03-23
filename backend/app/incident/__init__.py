"""
Chetana — P0 Incident Mode module.

Import the router and include it in main.py:

    from app.incident.incident_mode import router as incident_router
    app.include_router(incident_router)
"""
from .incident_mode import router  # noqa: F401
