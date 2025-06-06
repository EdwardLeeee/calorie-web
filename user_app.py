# app.py
from flask import Flask, render_template, request, redirect, url_for, session
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
import os
import requests

# 載入 .env 中的資料庫設定與秘鑰
load_dotenv()
DB_USER     = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST     = os.getenv("DB_HOST", "localhost")
DB_PORT     = os.getenv("DB_PORT", "3306")
DB_NAME     = os.getenv("DB_NAME")
SECRET_KEY  = os.getenv("SECRET_KEY", "dev_secret_key")
API_BASE    = os.getenv("API_BASE", "http://127.0.0.1:1122")

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = (
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = SECRET_KEY

db = SQLAlchemy(app)

# ---------- 使用者模型 (對應 user table) ----------
class User(db.Model):
    __tablename__ = "user"
    id            = db.Column(db.Integer, primary_key=True)
    username      = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column("password", db.String(200), nullable=False)

# ---------- 載入認證功能 (Blueprint) ----------
from flask import Blueprint, flash
from werkzeug.security import generate_password_hash, check_password_hash

auth = Blueprint('auth', __name__)

@auth.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        if not username or not password:
            flash('請輸入使用者名稱與密碼。')
            return redirect(url_for('auth.signup'))
        # 檢查帳號是否已存在
        existing = User.query.filter_by(username=username).first()
        if existing:
            flash('此使用者名稱已被註冊。')
            return redirect(url_for('auth.signup'))
        # 建立新使用者
        hashed = generate_password_hash(password)
        new_user = User(username=username, password_hash=hashed)
        db.session.add(new_user)
        db.session.commit()
        flash('註冊成功，請使用新帳號登入。')
        # 註冊完成後導向登入頁面
        return redirect(url_for('auth.login'))
    return render_template('signup.html')

@auth.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        user = User.query.filter_by(username=username).first()
        if user and check_password_hash(user.password_hash, password):
            session.clear()
            session['user_id'] = user.id
            return redirect(url_for('index'))
        flash('帳號或密碼錯誤。')
        return redirect(url_for('auth.login'))
    return render_template('login.html')

@auth.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('auth.login'))

app.register_blueprint(auth)

# ---------- 前端功能 (依賴已登入使用者) ----------
@app.before_request
def require_login():
    allowed = ['auth.login', 'auth.signup', 'static']
    if not session.get('user_id') and request.endpoint not in allowed:
        return redirect(url_for('auth.login'))

@app.route("/")
def index():
    user_id = session.get('user_id')
    # 向後端微服務取得該使用者的自訂食物
    params = {'user_id': user_id}
    resp = requests.get(f"{API_BASE}/customer-foods", params=params)
    foods = resp.json() if resp.ok else []
    return render_template("index.html", foods=foods)

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
    # 呼叫微服務刪除
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
    # 若尚未建表，請先執行一次： with app.app_context(): db.create_all()
    app.run(debug=True, port=5000)
