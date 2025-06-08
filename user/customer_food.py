from flask import Flask, jsonify, request, abort, session
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import os

load_dotenv()
DB_USER     = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST     = os.getenv("DB_HOST", "localhost")
DB_PORT     = os.getenv("DB_PORT", "3306")
DB_NAME     = os.getenv("DB_NAME")
SECRET_KEY  = os.getenv("SECRET_KEY", "dev_secret_key")

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = (
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = SECRET_KEY

# 只允許前端同源呼叫／帶 Cookie
CORS(app, supports_credentials=True, origins=["http://127.0.0.1:5000"])

db = SQLAlchemy(app)

class User(db.Model):
    __tablename__ = "user"
    id            = db.Column(db.Integer, primary_key=True)
    username      = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column("password", db.String(200), nullable=False)

class CustomerFood(db.Model):
    __tablename__ = "customer_food"
    id       = db.Column(db.Integer, primary_key=True)
    user_id  = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    name     = db.Column(db.String(100), nullable=False)
    calories = db.Column(db.Float, nullable=False)
    protein  = db.Column(db.Float, nullable=False)
    fat      = db.Column(db.Float, nullable=False)
    carbs    = db.Column(db.Float, nullable=False)

    __table_args__ = (
        db.UniqueConstraint("user_id", "name", name="uq_user_foodname"),
    )

    def __init__(self, user_id, name, calories, protein, fat, carbs):
        self.user_id  = user_id
        self.name     = name
        self.calories = calories
        self.protein  = protein
        self.fat      = fat
        self.carbs    = carbs

    def to_dict(self):
        return {
            "id":       self.id,
            "user_id":  self.user_id,
            "name":     self.name,
            "calories": self.calories,
            "protein":  self.protein,
            "fat":      self.fat,
            "carbs":    self.carbs,
        }

# ---------- RESTful endpoints ----------

# 先寫一個輔助：若 session 沒 user_id，就直接 401
def require_login():
    uid = session.get('user_id')
    if not uid:
        abort(401, description="未登入")

# 1. 取得（只看自己的 food）
@app.route("/customer-foods", methods=["GET"])
def get_customer_foods():
    require_login()
    uid = session['user_id']
    foods = CustomerFood.query.filter_by(user_id=uid).all()
    return jsonify([f.to_dict() for f in foods])

# 2. 取得特定自訂食物（但要確認歸屬）
@app.route("/customer-foods/<int:id>", methods=["GET"])
def get_customer_food(id):
    require_login()
    food = CustomerFood.query.get_or_404(id)
    if food.user_id != session['user_id']:
        abort(403, description="你沒有權限查看此項目")
    return jsonify(food.to_dict())

# 3. 新增自訂食物（只用 session user_id）
@app.route("/customer-foods", methods=["POST"])
def create_customer_food():
    require_login()
    data = request.get_json() or {}
    required = {"name", "calories", "protein", "fat", "carbs"}
    if not required.issubset(data):
        abort(400, description=f"Missing fields: {required - data.keys()}")

    # 直接從 session 拿 user_id，不信任前端傳過來的任何 user_id
    uid = session['user_id']
    name     = data['name']
    calories = data['calories']
    protein  = data['protein']
    fat      = data['fat']
    carbs    = data['carbs']

    food = CustomerFood(user_id=uid, name=name, calories=calories,
                        protein=protein, fat=fat, carbs=carbs)
    db.session.add(food)
    db.session.commit()
    return jsonify(food.to_dict()), 201

# 4. 更新自訂食物
@app.route("/customer-foods/<int:id>", methods=["PUT"])
def update_customer_food(id):
    require_login()
    food = CustomerFood.query.get_or_404(id)
    # 只允許修改自己名下的那筆
    if food.user_id != session['user_id']:
        abort(403, description="你沒有權限修改此項目")

    data = request.get_json() or {}
    for field in ["name", "calories", "protein", "fat", "carbs"]:
        if field in data:
            setattr(food, field, data[field])
    db.session.commit()
    return jsonify(food.to_dict())

# 5. 刪除自訂食物
@app.route("/customer-foods/<int:id>", methods=["DELETE"])
def delete_customer_food(id):
    require_login()
    food = CustomerFood.query.get_or_404(id)
    # 只允許刪除自己名下的那筆
    if food.user_id != session['user_id']:
        abort(403, description="你沒有權限刪除此項目")
    db.session.delete(food)
    db.session.commit()
    return "", 204

# ---------- 主程式 ----------
if __name__ == "__main__":
    # 第一次建表時：取消下面那行
    # with app.app_context(): db.create_all()
    app.run(debug=False, host="127.0.0.1", port=1122)

