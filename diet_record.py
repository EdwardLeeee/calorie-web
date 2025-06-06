# diet_record.py
from flask import Flask, jsonify, request, abort
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
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

# ---------- 既有模型（Food, CustomerFood, User）簡化版 ----------
class Food(db.Model):
    __tablename__ = "food"
    id        = db.Column(db.Integer, primary_key=True)
    name      = db.Column(db.String(100))
    calories  = db.Column(db.Float)
    protein   = db.Column(db.Float)
    fat       = db.Column(db.Float)
    carbs     = db.Column(db.Float)

class CustomerFood(db.Model):
    __tablename__ = "customer_food"
    id        = db.Column(db.Integer, primary_key=True)
    user_id   = db.Column(db.Integer, db.ForeignKey("user.id"))
    name      = db.Column(db.String(100))
    calories  = db.Column(db.Float)
    protein   = db.Column(db.Float)
    fat       = db.Column(db.Float)
    carbs     = db.Column(db.Float)

class User(db.Model):
    __tablename__ = "user"
    id = db.Column(db.Integer, primary_key=True)

# ---------- DietRecord 模型 ----------
class DietRecord(db.Model):
    __tablename__ = "diet_record"

    id               = db.Column(db.Integer, primary_key=True)
    user_id          = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    record_time      = db.Column(db.DateTime, nullable=False)
    official_food_id = db.Column(db.Integer, db.ForeignKey("food.id"), nullable=True)
    custom_food_id   = db.Column(db.Integer, db.ForeignKey("customer_food.id"), nullable=True)
    calorie_sum      = db.Column(db.Float, nullable=False)
    carb_sum         = db.Column(db.Float, nullable=False)
    protein_sum      = db.Column(db.Float, nullable=False)
    fat_sum          = db.Column(db.Float, nullable=False)

    official_food = db.relationship("Food")
    custom_food   = db.relationship("CustomerFood")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "record_time": self.record_time.isoformat(sep=" ", timespec="seconds"),
            "source": "official" if self.official_food_id else "custom",
            "food_id": self.official_food_id or self.custom_food_id,
            "calorie_sum": self.calorie_sum,
            "carb_sum": self.carb_sum,
            "protein_sum": self.protein_sum,
            "fat_sum": self.fat_sum,
        }

# ---------- 共用工具 ----------
def _calc_totals(food, qty: float):
    """根據食物營養值與份量計算總量"""
    return {
        "calorie_sum": food.calories * qty,
        "carb_sum":    food.carbs    * qty,
        "protein_sum": food.protein  * qty,
        "fat_sum":     food.fat      * qty,
    }

def _fetch_food(official_id, custom_id):
    """依來源 ID 抓 food 物件並回傳 (food_obj, source)"""
    if bool(official_id) == bool(custom_id):
        abort(400, "official_food_id 與 custom_food_id 必須且只能擇一填入")
    if official_id:
        food = Food.query.get_or_404(official_id)
        return food, "official"
    else:
        food = CustomerFood.query.get_or_404(custom_id)
        return food, "custom"

# ---------- RESTful endpoints (GET + POST 合併) ----------
@app.route("/diet_record", methods=["GET", "POST"])
def diet_records():
    if request.method == "GET":
        uid   = request.args.get("user_id", type=int)
        start = request.args.get("start")    # YYYY-MM-DD
        end   = request.args.get("end")
        q = DietRecord.query
        if uid:
            q = q.filter_by(user_id=uid)
        if start:
            q = q.filter(DietRecord.record_time >= datetime.fromisoformat(start))
        if end:
            q = q.filter(DietRecord.record_time <= datetime.fromisoformat(end))
        recs = q.order_by(DietRecord.record_time.desc()).all()
        return jsonify([r.to_dict() for r in recs])

    # POST
    data = request.get_json() or {}
    qty  = float(data.get("qty", 1))
    required = {"user_id", "record_time"}
    if not required.issubset(data):
        abort(400, f"缺少欄位: {required - data.keys()}")

    food, src = _fetch_food(data.get("official_food_id"), data.get("custom_food_id"))
    totals = _calc_totals(food, qty)

    rec = DietRecord(
        user_id          = data["user_id"],
        record_time      = datetime.fromisoformat(data["record_time"]),
        official_food_id = food.id if src == "official" else None,
        custom_food_id   = food.id if src == "custom"   else None,
        calorie_sum      = totals["calorie_sum"],
        carb_sum         = totals["carb_sum"],
        protein_sum      = totals["protein_sum"],
        fat_sum          = totals["fat_sum"],
    )
    db.session.add(rec)
    db.session.commit()
    return jsonify(rec.to_dict()), 201

@app.route("/diet_record/<int:rid>", methods=["GET", "PUT", "DELETE"])
def handle_record(rid):
    rec  = DietRecord.query.get_or_404(rid)

    if request.method == "GET":
        return jsonify(rec.to_dict())

    if request.method == "PUT":
        data = request.get_json() or {}
        if "qty" in data:
            qty = float(data["qty"])
            food = rec.official_food or rec.custom_food
            totals = _calc_totals(food, qty)
            rec.calorie_sum = totals["calorie_sum"]
            rec.carb_sum    = totals["carb_sum"]
            rec.protein_sum = totals["protein_sum"]
            rec.fat_sum     = totals["fat_sum"]
        if "record_time" in data:
            rec.record_time = datetime.fromisoformat(data["record_time"])
        db.session.commit()
        return jsonify(rec.to_dict())

    # DELETE
    db.session.delete(rec)
    db.session.commit()
    return "", 204

# ---------- Main ----------
if __name__ == "__main__":
    # with app.app_context(): db.create_all()
    app.run(debug=True, host="127.0.0.1", port=1133)

