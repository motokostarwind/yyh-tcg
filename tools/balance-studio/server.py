"""
Yu Yu Hakusho TCG - Balance Studio Local Server
Serves static repository files and provides active-learning API endpoints for:
- Feedback submission (/api/feedback)
- Automated recalibration (/api/recalibrate)
- Live production export (/api/publish)
"""

import http.server
import json
import os
import socketserver
import sys
import urllib.parse

STUDIO_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(os.path.dirname(STUDIO_DIR))
DATA_DIR = os.path.join(STUDIO_DIR, "data")
FEEDBACK_FILE = os.path.join(DATA_DIR, "feedback_history.json")
METRICS_FILE = os.path.join(DATA_DIR, "card_metrics.json")

sys.path.insert(0, os.path.join(STUDIO_DIR, "engine"))
import recalibrate


class BalanceStudioHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path in ("/", "/studio", "/balance-studio"):
            self.send_response(302)
            self.send_header("Location", "/tools/balance-studio/index.html")
            self.end_headers()
            return

        if path == "/api/status":
            feedback_data = recalibrate.load_json(FEEDBACK_FILE, {"reviews": {}, "heuristics": []})
            reviews = feedback_data.get("reviews", {})
            metrics = recalibrate.load_json(METRICS_FILE, {})
            payload = {
                "status": "online",
                "totalCards": len(metrics),
                "totalReviews": len(reviews),
                "approved": sum(1 for f in reviews.values() if isinstance(f, dict) and f.get("decision") == "approve"),
                "disputed": sum(1 for f in reviews.values() if isinstance(f, dict) and f.get("decision") == "dispute")
            }
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(payload).encode("utf-8"))
            return

        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            data = json.loads(body.decode("utf-8"))
        except Exception:
            data = {}

        if path == "/api/feedback":
            feedback_data = recalibrate.load_json(FEEDBACK_FILE, {"reviews": {}, "heuristics": []})
            reviews = feedback_data.get("reviews", {})
            card_id = data.get("cardId")
            if card_id:
                reviews[card_id] = data
                feedback_data["reviews"] = reviews
                recalibrate.save_json(FEEDBACK_FILE, feedback_data)
                
                # Also apply live to card_metrics.json immediately!
                recalibrate.run_recalibration()

            response = {
                "success": True,
                "message": f"Recorded feedback for {card_id}",
                "totalReviews": len(reviews)
            }
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(response).encode("utf-8"))
            return

        elif path == "/api/recalibrate":
            weights = data.get("weights")
            success = recalibrate.run_recalibration(weights)
            response = {"success": success, "message": "Recalibration complete."}
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(response).encode("utf-8"))
            return

        elif path == "/api/publish":
            success = recalibrate.publish_to_live()
            response = {"success": success, "message": "Published to src/data/card_balance_matrix.json"}
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(response).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()


def run_server(port=8000):
    handler = BalanceStudioHandler
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), handler) as httpd:
        print(f"YYH TCG Balance Studio Server running at http://localhost:{port}/tools/balance-studio/index.html")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")


if __name__ == "__main__":
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    run_server(port)
