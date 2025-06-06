# admin.py

import os
import datetime
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt
)
from passlib.context import CryptContext

# 1. 載入 .env
load_dotenv()

# 2. 建立 Flask 應用
app = Flask(__name__)

# 3. 從環境變數讀取資料庫連線字串與 JWT 密鑰
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URI")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = datetime.timedelta(hours=1)

# 4. 初始化 SQLAlchemy 與 JWTManager
db = SQLAlchemy(app)
jwt = JWTManager(app)

# 5. 設定密碼雜湊上下文 (Argon2)
pwd_ctx = CryptContext(schemes=["argon2"], deprecated="auto")

def hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)

# 6. 定義 Admin 模型
class Admin(db.Model):
    __tablename__ = "admin"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)

    def __repr__(self):
        return f"<Admin {self.username}>"

# 7. 管理員登入 API：POST /admin/login
@app.post("/admin/login")
def admin_login():
    data = request.get_json(silent=True) or {}
    uname = data.get("username")
    pwd = data.get("password")
    if not (uname and pwd):
        return jsonify(msg="缺少帳號或密碼欄位"), 400

    user = Admin.query.filter_by(username=uname).first()
    if not user or not verify_password(pwd, user.password):
        return jsonify(msg="Invalid credentials"), 401

    access = create_access_token(
        identity={"id": user.id, "role": "admin"}
    )
    refresh = create_refresh_token(identity=user.id)

    return jsonify(
        access_token=access,
        refresh_token=refresh,
        token_type="Bearer",
        expires_in=app.config["JWT_ACCESS_TOKEN_EXPIRES"].seconds
    ), 200

# 8. 受保護路由範例：GET /admin/protected
@app.get("/admin/protected")
@jwt_required()
def admin_protected():
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify(msg="Permission denied"), 403
    return jsonify(msg="This is an admin-only endpoint"), 200

# 9. 啟動前建立資料表
if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(host="0.0.0.0", port=1120, debug=True)

