# frontend_app.py (僅負責串 customer API 及 index.html，不再自行處理登入/註冊/登出)
from flask import Flask, render_template, request, redirect, url_for, session
from dotenv import load_dotenv
import os
import requests

# 載入 .env
load_dotenv()
API_BASE   = os.getenv("API_BASE", "http://127.0.0.1:1122")
AUTH_BASE  = os.getenv("AUTH_BASE", "http://127.0.0.1:5001")
SECRET_KEY = os.getenv("SECRET_KEY", "dev_secret_key")

app = Flask(__name__)
app.config['SECRET_KEY'] = SECRET_KEY

@app.after_request
def add_no_cache_headers(response):
    """
    让浏览器不要缓存所有响应，尤其是需要登录才能访问的页面。
    这样用户登出后，按返回就会重新向服务器请求，而不是从缓存显示旧页面。
    """
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@app.before_request
def require_login():
    """
    如果尚未在前端 session 中看到 user_id，就把整個請求導到 auth 服務的 /login。
    這樣用戶只能先到 auth.py 去登入，登入後 auth.py 會 set-cookie，
    再重導到這裡時，session['user_id'] 就應該已存在（同一個域名下共用 cookie）。
    """
    # 如果前端 session 沒有 user_id，且不是在 static 目錄，直接跳到 auth 服務登入
    if not session.get('user_id') and not request.path.startswith('/static'):
        # 直接跳到 auth 的登入畫面
        return redirect(f"{AUTH_BASE}/login")


@app.route("/")   
def index():
    user_id = session.get('user_id')
    # 向 Customer Foods API 傳 user_id 取得該使用者的資料
    params = {'user_id': user_id}
    resp = requests.get(f"{API_BASE}/customer-foods", params={'user_id':user_id})
    foods = resp.json() if resp.ok else []
    
    return render_template(
        "index.html",
        foods=foods,
        AUTH_BASE=os.getenv("AUTH_BASE", "http://127.0.0.1:5001")
    )

@app.route("/add", methods=["POST"])
def add_food():
    user_id = session.get('user_id')
    data = {
        "user_id": user_id,
        "name": request.form['name'],
        "calories": float(request.form['calories']),
        "protein": float(request.form['protein']),
        "fat": float(request.form['fat']),
        "carbs": float(request.form['carbs'])
    }
    requests.post(f"{API_BASE}/customer-foods", json=data)
    return redirect(url_for('index'))

@app.route("/delete/<int:id>", methods=["POST"])
def delete_food(id):
    requests.delete(f"{API_BASE}/customer-foods/{id}")
    return redirect(url_for('index'))

@app.route("/update/<int:id>", methods=["POST"])
def update_food(id):
    data = {}
    for field in ['name', 'calories', 'protein', 'fat', 'carbs']:
        if request.form.get(field):
            value = request.form[field]
            data[field] = float(value) if field in ['calories', 'protein', 'fat', 'carbs'] else value
    if data:
        requests.put(f"{API_BASE}/customer-foods/{id}", json=data)
    return redirect(url_for('index'))

if __name__ == "__main__":
    app.run(debug=True, port=5000)

