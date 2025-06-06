# auth_admin.py  -----------------------------------------------------------
from flask import Flask, request, session, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import os

# ---------- 讀取 .env ----------
load_dotenv()
DB_USER       = os.getenv("DB_USER")
DB_PASSWORD   = os.getenv("DB_PASSWORD")
DB_HOST       = os.getenv("DB_HOST", "localhost")
DB_PORT       = os.getenv("DB_PORT", "3306")
DB_NAME       = os.getenv("DB_NAME")
SECRET_KEY    = os.getenv("SECRET_KEY", "dev_secret_key")
FRONTEND_BASE = os.getenv("ADMIN_FRONTEND_BASE", "http://127.0.0.1:5003")

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = (
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = SECRET_KEY

# 允許後台 (admin_app.py, 預設 5003) 夾帶 Cookie 跨域
CORS(app, supports_credentials=True, origins=[FRONTEND_BASE])

db = SQLAlchemy(app)

# ---------- Admin Model ----------
class Admin(db.Model):
    __tablename__ = "admin"
    id            = db.Column(db.Integer, primary_key=True)
    username      = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column("password", db.String(200), nullable=False)

# ---------- 無註冊功能；僅登入 ----------
@app.post("/login")
def admin_login():
    data = request.json or {}
    username = data.get("username")
    password = data.get("password")
    if not username or not password:
        return jsonify({"error": "請輸入帳號與密碼"}), 400

    admin = Admin.query.filter_by(username=username).first()
    if admin and check_password_hash(admin.password_hash, password):
        session.clear()
        session["admin_id"] = admin.id
        return jsonify({"message": "登入成功"}), 200
    return jsonify({"error": "帳號或密碼錯誤"}), 401

# ---------- 登出 ----------
@app.post("/logout")
def admin_logout():
    session.clear()
    return jsonify({"message": "已登出"}), 200

# ---------- 身分查詢 ----------
@app.get("/whoami")
def whoami():
    admin_id = session.get("admin_id")
    if not admin_id:
        return jsonify({"logged_in": False}), 401
    admin = Admin.query.get(admin_id)
    return jsonify({"logged_in": True, "username": admin.username}), 200

if __name__ == "__main__":
    with app.app_context():
        db.create_all()       # 確保 admin 表存在 (需先預插一筆帳號)
    app.run(debug=True, port=5002)

