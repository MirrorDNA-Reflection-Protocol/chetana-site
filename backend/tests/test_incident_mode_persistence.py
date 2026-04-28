import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.incident.incident_mode import start_incident
from app.incident.models import IncidentStartRequest, RiskBand


class IncidentModePersistenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_start_incident_resumes_existing_scan_case(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            session_root = Path(temp_dir)
            session_root.mkdir(parents=True, exist_ok=True)

            with patch("app.incident.incident_mode._SESSION_ROOT", session_root):
                req = IncidentStartRequest(
                    scan_id="chetana-scan-persisted",
                    risk_level=RiskBand.red,
                    score=88,
                    raw_signals=["payment request", "urgency"],
                )

                first = await start_incident(req)
                second = await start_incident(req)

                self.assertEqual(first.incident_id, second.incident_id)
                self.assertEqual(first.step, second.step)
                self.assertEqual(len(list(session_root.glob("*.json"))), 1)


if __name__ == "__main__":
    unittest.main()
