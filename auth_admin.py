# auth_admin.py  ------------------------------
from flask import Flask, request, session, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import os

load_dotenv()
DB_USER       = os.getenv("DB_USER")
DB_PASSWORD   = os.getenv("DB_PASSWORD")
DB_HOST       = os.getenv("DB_HOST", "localhost")
DB_PORT       = os.getenv("DB_PORT", "3306")
DB_NAME       = os.getenv("DB_NAME")
SECRET_KEY    = os.getenv("SECRET_KEY", "dev_secret_key")
FRONT_ORIGIN  = os.getenv("ADMIN_FRONTEND_BASE", "http://127.0.0.1:8080")  # Vue dev

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = (
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = SECRET_KEY

# 允許帶 Cookie 的跨域
CORS(app, supports_credentials=True, origins=[FRONT_ORIGIN])

db = SQLAlchemy(app)

# -------- Admin Model --------
class Admin(db.Model):
    __tablename__ = "admin"
    id            = db.Column(db.Integer, primary_key=True)
    username      = db.Column(db.String(50), unique=True, nullable=False)
    # 資料庫欄名 password，程式屬性 password_hash
    password_hash = db.Column("password", db.String(200), nullable=False)

# -------- 登入 --------
@app.post("/login")
def admin_login():
    data = request.get_json(force=True)
    u, p = data.get("username"), data.get("password")
    if not u or not p:
        return jsonify({"msg": "缺少帳號或密碼"}), 400

    admin = Admin.query.filter_by(username=u).first()
    if not admin or not check_password_hash(admin.password_hash, p):
        return jsonify({"msg": "帳號或密碼錯誤"}), 401

    session.clear()
    session["admin_id"] = admin.id
    return jsonify({"msg": "login ok"}), 200

# -------- 登出 --------
@app.post("/logout")
def admin_logout():
    session.clear()
    return jsonify({"msg": "logout ok"}), 200

# -------- 檢查是否已登入 --------
@app.get("/whoami")
def whoami():
    aid = session.get("admin_id")
    if not aid:
        return jsonify({"logged_in": False}), 401
    admin = Admin.query.get(aid)
    return jsonify({"logged_in": True, "username": admin.username})

if __name__ == "__main__":
    with app.app_context():
        db.create_all()   # 確保 admin 表在
    app.run(debug=True, port=5002)

