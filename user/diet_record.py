# diet_record_service.py

from flask import Flask, jsonify, request, abort, session
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import os
from datetime import datetime

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

# 允許來自前端 (http://127.0.0.1:5000) 的跨域請求，並攜帶 Cookie
CORS(app, supports_credentials=True, origins=["http://127.0.0.1:5000"])

db = SQLAlchemy(app)

# ----- Models -----
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

class OfficialFood(db.Model):
    __tablename__ = "food"
    id       = db.Column(db.Integer, primary_key=True)
    name     = db.Column(db.String(100), nullable=False)
    calories = db.Column(db.Float, nullable=False)
    protein  = db.Column(db.Float, nullable=False)
    fat      = db.Column(db.Float, nullable=False)
    carbs    = db.Column(db.Float, nullable=False)

    def to_dict(self):
        return {
            "id":       self.id,
            "name":     self.name,
            "calories": self.calories,
            "protein":  self.protein,
            "fat":      self.fat,
            "carbs":    self.carbs,
        }

class DietRecord(db.Model):
    __tablename__ = "diet_record"
    id               = db.Column(db.Integer, primary_key=True)
    user_id          = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    record_time      = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    qty              = db.Column(db.Float,     nullable=False, default=1)
    official_food_id = db.Column(db.Integer, db.ForeignKey("food.id"), nullable=True)
    custom_food_id   = db.Column(db.Integer, db.ForeignKey("customer_food.id"), nullable=True)
    calorie_sum      = db.Column(db.Float, nullable=False)
    carb_sum         = db.Column(db.Float, nullable=False)
    protein_sum      = db.Column(db.Float, nullable=False)
    fat_sum          = db.Column(db.Float, nullable=False)

    def to_dict(self):
        return {
            "id":               self.id,
            "user_id":          self.user_id,
            "record_time":      self.record_time.isoformat(sep=' '),
            "qty": self.qty,
            "official_food_id": self.official_food_id,
            "custom_food_id":   self.custom_food_id,
            "calorie_sum":      self.calorie_sum,
            "carb_sum":         self.carb_sum,
            "protein_sum":      self.protein_sum,
            "fat_sum":          self.fat_sum
        }

# ----- Helper -----
def require_login():
    uid = session.get('user_id')
    if not uid:
        abort(401, description="未登入")

# ----- CRUD Endpoints -----

# 取得官方食物列表 (給前端下拉選單用)
@app.route("/official-foods", methods=["GET"])
def get_official_foods():
    # 這個不強制 require_login，但前端在用時會先確認登入
    foods = OfficialFood.query.all()
    return jsonify([f.to_dict() for f in foods])

# 取得該使用者所有飲食紀錄
@app.route("/diet-records", methods=["GET"])
def get_diet_records():
    require_login()
    uid = session['user_id']
    records = DietRecord.query.filter_by(user_id=uid).order_by(DietRecord.record_time.desc()).all()
    return jsonify([r.to_dict() for r in records])

# 取得特定紀錄 (僅限本人)
@app.route("/diet-records/<int:id>", methods=["GET"])
def get_diet_record(id):
    require_login()
    record = DietRecord.query.get_or_404(id)
    if record.user_id != session['user_id']:
        abort(403, description="沒有權限")
    return jsonify(record.to_dict())

# 新增飲食紀錄 (依 session(user_id) 決定 user_id)
@app.route("/diet-records", methods=["POST"])
def create_diet_record():
    require_login()
    data = request.get_json() or {}
    # 必填欄位
    required = ["record_time", "qty", "calorie_sum", "carb_sum", "protein_sum", "fat_sum"]
    missing = [k for k in required if k not in data]
    if missing:
        abort(400, description=f"Missing fields: {missing}")

    # 轉 iso 格式
    try:
        rt = datetime.fromisoformat(data["record_time"])
        qty = float(data["qty"])
    except Exception:
        abort(400, description="record_time 格式需為 ISO 字串 (YYYY-MM-DDTHH:MM)；qty 需為數字")

    ofid = data.get("official_food_id")
    cfid = data.get("custom_food_id")

    uid = session['user_id']
    new_rec = DietRecord(
        user_id          = uid,
        record_time      = rt,
        qty              = qty,
        official_food_id = ofid,
        custom_food_id   = cfid,
        calorie_sum      = data["calorie_sum"],
        carb_sum         = data["carb_sum"],
        protein_sum      = data["protein_sum"],
        fat_sum          = data["fat_sum"]
    )
    db.session.add(new_rec)
    db.session.commit()
    return jsonify(new_rec.to_dict()), 201

# 更新飲食紀錄
@app.route("/diet-records/<int:id>", methods=["PUT"])
def update_diet_record(id):
    require_login()
    record = DietRecord.query.get_or_404(id)
    if record.user_id != session['user_id']:
        abort(403, description="沒有權限")

    data = request.get_json() or {}
    if "record_time" in data:
        try:
            record.record_time = datetime.fromisoformat(data["record_time"])
        except Exception:
            abort(400, description="record_time 格式需為 ISO 字串 (YYYY-MM-DDTHH:MM)")
    if "qty" in data:
        try:
            record.qty = float(data["qty"])
        except:
            abort(400, description="qty 需為數字")
    for field in ["official_food_id", "custom_food_id", "calorie_sum", "carb_sum", "protein_sum", "fat_sum"]:
        if field in data:
            setattr(record, field, data[field])

    db.session.commit()
    return jsonify(record.to_dict())

# 刪除飲食紀錄
@app.route("/diet-records/<int:id>", methods=["DELETE"])
def delete_diet_record(id):
    require_login()
    record = DietRecord.query.get_or_404(id)
    if record.user_id != session['user_id']:
        abort(403, description="沒有權限")
    db.session.delete(record)
    db.session.commit()
    return "", 204

if __name__ == "__main__":
    # 第一次啟動若未建表，取消下面那行：
    # with app.app_context(): db.create_all()
    app.run(debug=True, host="127.0.0.1", port=1133)

