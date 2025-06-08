# 修改後的 auth.py 範例
from flask import Flask, request, redirect, session, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import os

load_dotenv()
DB_USER    = os.getenv("DB_USER")
DB_PASSWORD= os.getenv("DB_PASSWORD")
DB_HOST    = os.getenv("DB_HOST", "localhost")
DB_PORT    = os.getenv("DB_PORT", "3306")
DB_NAME    = os.getenv("DB_NAME")
SECRET_KEY = os.getenv("SECRET_KEY", "dev_secret_key")
FRONTEND_BASE = os.getenv("FRONTEND_BASE", "http://127.0.0.1:5000")

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = (
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = SECRET_KEY

# 啟用 CORS，允許 Vue 前端 (http://127.0.0.1:5000) 跨域請求、攜帶 Cookie
CORS(app, supports_credentials=True, origins=["http://127.0.0.1:5000"])

db = SQLAlchemy(app)

class User(db.Model):
    __tablename__ = "user"
    id            = db.Column(db.Integer, primary_key=True)
    username      = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column("password", db.String(200), nullable=False)

@app.route('/signup', methods=['POST'])
def signup():
    data = request.json or {}
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        return jsonify({"error": "請輸入使用者名稱與密碼。"}), 400

    existing = User.query.filter_by(username=username).first()
    if existing:
        return jsonify({"error": "此使用者名稱已被註冊。"}), 409

    hashed = generate_password_hash(password)
    new_user = User(username=username, password_hash=hashed)
    db.session.add(new_user)
    db.session.commit()

    # 註冊成功——直接回傳狀態 201，不再重定向
    return jsonify({"message": "已註冊，請重新登入。"}), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.json or {}
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        return jsonify({"error": "請輸入使用者名稱與密碼。"}), 400

    user = User.query.filter_by(username=username).first()
    if user and check_password_hash(user.password_hash, password):
        session.clear()
        session['user_id'] = user.id
        # 登入成功，回傳成功訊息
        return jsonify({"message": "登入成功"}), 200

    return jsonify({"error": "帳號或密碼錯誤。"}), 401

@app.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"message": "已登出"}), 200

# （可選）提供一個簡單的 "whoami" endpoint 讓前端查詢登入者
@app.route('/whoami', methods=['GET'])
def whoami():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"logged_in": False}), 401
    user = User.query.get(user_id)
    return jsonify({"logged_in": True, "username": user.username}), 200

if __name__ == '__main__':
    app.run(debug=True, port=5001)

