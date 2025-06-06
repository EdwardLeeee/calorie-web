from flask import Flask, jsonify, request, abort
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import os

app = Flask(__name__)
load_dotenv()

app.config["SQLALCHEMY_DATABASE_URI"] = (
    f"mysql+pymysql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}"
    f"@{os.getenv('DB_HOST','localhost')}:{os.getenv('DB_PORT','3306')}/{os.getenv('DB_NAME')}"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)

# ---------- Model ----------
class User(db.Model):
    __tablename__ = "user"
    id            = db.Column(db.Integer, primary_key=True)
    username      = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)

    def __init__(self, username, password):
        self.username      = username
        self.password_hash = generate_password_hash(password)

    def to_dict(self):
        return {"id": self.id, "username": self.username}

# ---------- RESTful endpoints ----------
# 1. 取得全用戶
@app.route("/users", methods=["GET"])
def list_users():
    return jsonify([u.to_dict() for u in User.query.all()])

# 2. 取得單一用戶
@app.route("/users/<int:uid>", methods=["GET"])
def get_user(uid):
    u = User.query.get_or_404(uid)
    return jsonify(u.to_dict())

# 3. 註冊
@app.route("/users", methods=["POST"])
def create_user():
    data = request.get_json() or {}
    if not {"username", "password"} <= data.keys():
        abort(400, description="username 與 password 為必填")
    if User.query.filter_by(username=data["username"]).first():
        abort(409, description="使用者名稱已存在")
    u = User(data["username"], data["password"])
    db.session.add(u)
    db.session.commit()
    return jsonify(u.to_dict()), 201

# 4. 更新（僅允許改密碼）
@app.route("/users/<int:uid>", methods=["PUT"])
def update_user(uid):
    u    = User.query.get_or_404(uid)
    data = request.get_json() or {}
    if "password" not in data:
        abort(400, description="目前僅支援變更密碼")
    u.password_hash = generate_password_hash(data["password"])
    db.session.commit()
    return jsonify(u.to_dict())

# 5. 刪除
@app.route("/users/<int:uid>", methods=["DELETE"])
def delete_user(uid):
    u = User.query.get_or_404(uid)
    db.session.delete(u)
    db.session.commit()
    return "", 204

# 6. 登入驗證（回傳簡訊息；如需 token 可自行加 JWT）
@app.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    if not {"username", "password"} <= data.keys():
        abort(400, description="缺少 username 或 password")
    u = User.query.filter_by(username=data["username"]).first()
    if u and check_password_hash(u.password_hash, data["password"]):
        return jsonify({"msg": "login ok", "user_id": u.id})
    abort(401, description="帳號或密碼錯誤")

# ---------- Main ----------
if __name__ == "__main__":
    # 首次啟動若要讓 SQLAlchemy 幫你建表，取消下行註解一次即可
    # with app.app_context(): db.create_all()
    app.run(debug=True, host="127.0.0.1", port=1144)

