from flask import Flask, jsonify, request, abort
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
import os

app = Flask(__name__)

# 載入 .env
load_dotenv()
user     = os.getenv("DB_USER")
password = os.getenv("DB_PASSWORD")
host     = os.getenv("DB_HOST", "localhost")
port     = os.getenv("DB_PORT", "3306")
dbname   = os.getenv("DB_NAME")

# 連線字串
app.config["SQLALCHEMY_DATABASE_URI"] = (
    f"mysql+pymysql://{user}:{password}@{host}:{port}/{dbname}"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)

# ---------- Model ----------
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

    # 選擇性：若想避免同一位使用者重複命名
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
# 1. 取得（可選 user_id 篩選）
@app.route("/customer-foods", methods=["GET"])
def get_customer_foods():
    uid = request.args.get("user_id", type=int)
    query = CustomerFood.query
    if uid is not None:
        query = query.filter_by(user_id=uid)
    foods = query.all()
    return jsonify([f.to_dict() for f in foods])

# 2. 取得特定自訂食物
@app.route("/customer-foods/<int:id>", methods=["GET"])
def get_customer_food(id):
    food = CustomerFood.query.get_or_404(id)
    return jsonify(food.to_dict())

# 3. 新增自訂食物
@app.route("/customer-foods", methods=["POST"])
def create_customer_food():
    data = request.get_json() or {}
    required = {"user_id", "name", "calories", "protein", "fat", "carbs"}
    if not required.issubset(data):
        abort(400, description=f"Missing fields: {required - data.keys()}")

    food = CustomerFood(**{k: data[k] for k in required})
    db.session.add(food)
    db.session.commit()
    return jsonify(food.to_dict()), 201

# 4. 更新自訂食物
@app.route("/customer-foods/<int:id>", methods=["PUT"])
def update_customer_food(id):
    food = CustomerFood.query.get_or_404(id)
    data = request.get_json() or {}
    for field in ["name", "calories", "protein", "fat", "carbs"]:
        if field in data:
            setattr(food, field, data[field])
    db.session.commit()
    return jsonify(food.to_dict())

# 5. 刪除自訂食物
@app.route("/customer-foods/<int:id>", methods=["DELETE"])
def delete_customer_food(id):
    food = CustomerFood.query.get_or_404(id)
    db.session.delete(food)
    db.session.commit()
    return "", 204

# ---------- 主程式 ----------
if __name__ == "__main__":
    # 初次使用若尚未建表，取消下一行
    # with app.app_context(): db.create_all()
    app.run(debug=True, host="127.0.0.1", port=1122)

