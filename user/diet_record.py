# diet_record_service.py

from flask import Flask, jsonify, request, abort, session
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import os
from datetime import datetime, timedelta

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
    food_name        = db.Column(db.String(100), nullable=False)
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
            "food_name":	self.food_name,
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
    # 從 URL 查詢參數中獲取日期字串
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')

    # 建立基礎查詢
    query = DietRecord.query.filter_by(user_id=uid)

    # 如果有提供 start_date，則加入起始日期的過濾條件
    if start_date_str:
        try:
            # 轉換字串為 date 物件 (只取年-月-日)
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            # 查詢條件：紀錄時間 >= 起始日期的 00:00:00
            query = query.filter(DietRecord.record_time >= start_date)
        except ValueError:
            abort(400, description="start_date 格式錯誤，請使用 YYYY-MM-DD")

    # 如果有提供 end_date，則加入結束日期的過濾條件
    if end_date_str:
        try:
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
            # 查詢條件：紀錄時間 < 結束日期的隔天 00:00:00 (這樣才能包含結束日期當天)
            query = query.filter(DietRecord.record_time < end_date + timedelta(days=1))
        except ValueError:
            abort(400, description="end_date 格式錯誤，請使用 YYYY-MM-DD")
            
    # 執行查詢並排序
    records = query.order_by(DietRecord.record_time.desc()).all()
    
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
    manual_name = data.get("food_name")

    # 確保至少一個食物來源
    if not any([ofid, cfid, manual_name]):
        abort(400, description="需指定 official_food_id、custom_food_id 或 manual_name")

    # 產生 food_name 欄位
    if manual_name:
        food_name = manual_name
    elif ofid:
        food = OfficialFood.query.get(ofid)
        if not food:
            abort(400, description="找不到指定的 official_food_id")
        food_name = food.name
    elif cfid:
        food = CustomerFood.query.get(cfid)
        if not food:
            abort(400, description="找不到指定的 custom_food_id")
        food_name = food.name
    else:
        food_name = "未知"

    uid = session['user_id']
    new_rec = DietRecord(
        user_id          = uid,
        record_time      = rt,
        qty              = qty,
        official_food_id = ofid,
        custom_food_id   = cfid,
        food_name        = food_name,
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
    
    # 更新食物來源
    updated_food_source = False

    # 情況1：更新為手動輸入
    if "food_name" in data and data["food_name"]:
        # 直接更新 food_name
        record.food_name = data["food_name"]
        record.official_food_id = None
        record.custom_food_id = None
        updated_food_source = True

    # 情況2：更新為官方食物
    elif "official_food_id" in data and data["official_food_id"]:
        food = OfficialFood.query.get(data["official_food_id"])
        if not food:
            abort(400, description="找不到指定的 official_food_id")
        record.official_food_id = data["official_food_id"]
        record.custom_food_id = None
        # 同樣更新 food_name
        record.food_name = food.name
        updated_food_source = True

    # 情況3：更新為自訂食物
    elif "custom_food_id" in data and data["custom_food_id"]:
        food = CustomerFood.query.get(data["custom_food_id"])
        if not food:
            abort(400, description="找不到指定的 custom_food_id")
        # 並且要檢查這個自訂食物是否屬於當前使用者
        if food.user_id != session['user_id']:
            abort(403, description="沒有權限使用此自訂食物")
        record.custom_food_id = data["custom_food_id"]
        record.official_food_id = None
        # 同樣更新 food_name
        record.food_name = food.name
        updated_food_source = True
    # ----------------------------------------------------
        
    # 更新營養總和欄位
    for field in ["calorie_sum", "carb_sum", "protein_sum", "fat_sum"]:
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

