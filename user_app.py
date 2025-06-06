#前端 Flask 應用: frontend_app.py
from flask import Flask, render_template, request, redirect, url_for
import requests
import os

app = Flask(__name__)
API_BASE = os.environ.get("API_BASE", "http://127.0.0.1:1122")

@app.route("/")
def index():
    # 可透過 query string 指定 user_id，例如 /?user_id=1
    user_id = request.args.get("user_id", type=int)
    params = {}
    if user_id:
        params['user_id'] = user_id
    response = requests.get(f"{API_BASE}/customer-foods", params=params)
    foods = response.json() if response.ok else []
    return render_template("index.html", foods=foods, user_id=user_id)

@app.route("/add", methods=["POST"])
def add_food():
    data = {
        "user_id": int(request.form['user_id']),
        "name": request.form['name'],
        "calories": float(request.form['calories']),
        "protein": float(request.form['protein']),
        "fat": float(request.form['fat']),
        "carbs": float(request.form['carbs'])
    }
    requests.post(f"{API_BASE}/customer-foods", json=data)
    return redirect(url_for('index', user_id=data['user_id']))

@app.route("/delete/<int:id>", methods=["POST"])
def delete_food(id):
    # 先取得該項目以獲取 user_id
    resp = requests.get(f"{API_BASE}/customer-foods/{id}")
    if not resp.ok:
        return "Not Found", 404
    user_id = resp.json()['user_id']
    requests.delete(f"{API_BASE}/customer-foods/{id}")
    return redirect(url_for('index', user_id=user_id))

@app.route("/update/<int:id>", methods=["POST"])
def update_food(id):
    # 取得 user_id 以確保回到正確頁面
    resp = requests.get(f"{API_BASE}/customer-foods/{id}")
    if not resp.ok:
        return "Not Found", 404
    user_id = resp.json()['user_id']
    data = {}
    for field in ['name', 'calories', 'protein', 'fat', 'carbs']:
        if request.form.get(field):
            value = request.form[field]
            # 數值欄位轉型
            if field in ['calories', 'protein', 'fat', 'carbs']:
                data[field] = float(value)
            else:
                data[field] = value
    if data:
        requests.put(f"{API_BASE}/customer-foods/{id}", json=data)
    return redirect(url_for('index', user_id=user_id))

if __name__ == "__main__":
    app.run(debug=True, port=5000)

