# admin_app.py  ------------------------------------------------------------
from flask import (
    Flask, render_template, request,
    redirect, url_for, session
)
from dotenv import load_dotenv
import os, requests

load_dotenv()
FOOD_API_BASE = os.getenv("FOOD_API_BASE", "http://127.0.0.1:1121")
AUTH_BASE     = os.getenv("AUTH_ADMIN_BASE", "http://127.0.0.1:5002")
SECRET_KEY    = os.getenv("SECRET_KEY", "dev_secret_key")

app = Flask(__name__)
app.config["SECRET_KEY"] = SECRET_KEY

# ---------- 不快取 ----------
@app.after_request
def no_cache(resp):
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp

# ---------- 需先登入 Admin ----------
@app.before_request
def require_admin():
    if not session.get("admin_id") and not request.path.startswith("/static"):
        return redirect(f"{AUTH_BASE}/login")

# ---------- 首頁：列出所有 food ----------
@app.get("/")
def index():
    resp = requests.get(f"{FOOD_API_BASE}/foods")
    foods = resp.json() if resp.ok else []
    return render_template(
        "admin_index.html",
        foods=foods,
        AUTH_BASE=AUTH_BASE
    )

# ---------- 新增 food ----------
@app.post("/add")
def add_food():
    data = {
        "name": request.form["name"],
        "calories": float(request.form["calories"]),
        "protein": float(request.form["protein"]),
        "fat": float(request.form["fat"]),
        "carbs": float(request.form["carbs"])
    }
    requests.post(f"{FOOD_API_BASE}/foods", json=data)
    return redirect(url_for("index"))

# ---------- 刪除 food ----------
@app.post("/delete/<int:food_id>")
def delete_food(food_id):
    requests.delete(f"{FOOD_API_BASE}/foods/{food_id}")
    return redirect(url_for("index"))

# ---------- 更新 food ----------
@app.post("/update/<int:food_id>")
def update_food(food_id):
    data = {}
    for f in ["name", "calories", "protein", "fat", "carbs"]:
        if request.form.get(f):
            val = request.form[f]
            data[f] = float(val) if f in ["calories", "protein", "fat", "carbs"] else val
    if data:
        requests.put(f"{FOOD_API_BASE}/foods/{food_id}", json=data)
    return redirect(url_for("index"))

if __name__ == "__main__":
    app.run(debug=True, port=5003)

