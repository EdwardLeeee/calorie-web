# diet_record_service.py

from flask import Flask, jsonify, request, abort, session
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import os
from datetime import datetime
import sys

# --- 環境變數與設定 ---
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

CORS(app, supports_credentials=True, origins=["http://127.0.0.1:5000"])

db = SQLAlchemy(app)

# --- 除錯日誌輔助函式 ---
def log_debug(message):
    """將除錯訊息印到標準錯誤輸出，方便在伺服器終端機查看"""
    print(f"--- DEBUG [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] ---\n{message}\n", file=sys.stderr)

# --- 資料庫模型 (Models) ---
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
    __table_args__ = (db.UniqueConstraint("user_id", "name", name="uq_user_foodname"),)
    def to_dict(self):
        return {"id": self.id, "user_id": self.user_id, "name": self.name, "calories": self.calories, "protein": self.protein, "fat": self.fat, "carbs": self.carbs}

class OfficialFood(db.Model):
    __tablename__ = "food"
    id       = db.Column(db.Integer, primary_key=True)
    name     = db.Column(db.String(100), nullable=False)
    calories = db.Column(db.Float, nullable=False)
    protein  = db.Column(db.Float, nullable=False)
    fat      = db.Column(db.Float, nullable=False)
    carbs    = db.Column(db.Float, nullable=False)
    def to_dict(self):
        return {"id": self.id, "name": self.name, "calories": self.calories, "protein": self.protein, "fat": self.fat, "carbs": self.carbs}

class DietRecord(db.Model):
    __tablename__ = "diet_record"
    id               = db.Column(db.Integer, primary_key=True)
    user_id          = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    record_time      = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    qty              = db.Column(db.Float, nullable=False, default=1)
    official_food_id = db.Column(db.Integer, db.ForeignKey("food.id"), nullable=True)
    custom_food_id   = db.Column(db.Integer, db.ForeignKey("customer_food.id"), nullable=True)
    calorie_sum      = db.Column(db.Float, nullable=False)
    carb_sum         = db.Column(db.Float, nullable=False)
    protein_sum      = db.Column(db.Float, nullable=False)
    fat_sum          = db.Column(db.Float, nullable=False)
    def to_dict(self):
        return {"id": self.id, "user_id": self.user_id, "record_time": self.record_time.isoformat(sep=' '), "qty": self.qty, "official_food_id": self.official_food_id, "custom_food_id": self.custom_food_id, "calorie_sum": self.calorie_sum, "carb_sum": self.carb_sum, "protein_sum": self.protein_sum, "fat_sum": self.fat_sum}

# --- 登入驗證輔助函式 ---
def require_login():
    uid = session.get('user_id')
    if not uid:
        abort(401, description="未登入，請先登入")

# --- 客製化錯誤處理器 (Custom Error Handlers) ---
@app.errorhandler(400)
def handle_bad_request(e):
    log_debug(f"[ERROR HANDLER] Sending 400 Response to client with message: {e.description}")
    return jsonify(error=str(e.description)), 400

@app.errorhandler(401)
def handle_unauthorized(e):
    log_debug(f"[ERROR HANDLER] Sending 401 Response to client with message: {e.description}")
    return jsonify(error=str(e.description)), 401

@app.errorhandler(403)
def handle_forbidden(e):
    log_debug(f"[ERROR HANDLER] Sending 403 Response to client with message: {e.description}")
    return jsonify(error=str(e.description)), 403

@app.errorhandler(404)
def handle_not_found(e):
    log_debug(f"[ERROR HANDLER] Sending 404 Response to client with message: {e.description}")
    return jsonify(error="請求的資源不存在 (Not Found)"), 404

@app.errorhandler(500)
def handle_internal_server_error(e):
    log_debug(f"[CRITICAL] An internal server error occurred: {e}")
    return jsonify(error="伺服器內部發生錯誤，請聯絡管理員"), 500

# --- API 端點 (Endpoints) ---
@app.route("/official-foods", methods=["GET"])
def get_official_foods():
    foods = OfficialFood.query.all()
    return jsonify([f.to_dict() for f in foods])

@app.route("/diet-records", methods=["GET"])
def get_diet_records():
    require_login()
    uid = session['user_id']
    records = DietRecord.query.filter_by(user_id=uid).order_by(DietRecord.record_time.desc()).all()
    return jsonify([r.to_dict() for r in records])

@app.route("/diet-records/<int:id>", methods=["GET"])
def get_diet_record(id):
    require_login()
    record = DietRecord.query.get_or_404(id)
    if record.user_id != session['user_id']:
        abort(403, description="沒有權限")
    return jsonify(record.to_dict())

@app.route("/diet-records", methods=["POST"])
def create_diet_record():
    log_debug("[REQUEST] POST /diet-records: Received a request to create a new record.")
    require_login()
    uid = session['user_id']
    
    data = request.get_json() or {}
    log_debug(f"User '{uid}' is creating a record. Raw JSON payload received:\n{data}")

    required = ["record_time", "qty", "calorie_sum", "carb_sum", "protein_sum", "fat_sum"]
    missing = [k for k in required if k not in data]
    if missing:
        abort(400, description=f"請求缺少必要欄位: {', '.join(missing)}")

    try:
        rt = datetime.fromisoformat(data["record_time"])
        qty = float(data["qty"])
    except (ValueError, TypeError):
        abort(400, description="record_time 或 qty 格式不正確")

    new_rec = DietRecord(
        user_id          = uid,
        record_time      = rt,
        qty              = qty,
        official_food_id = data.get("official_food_id"),
        custom_food_id   = data.get("custom_food_id"),
        calorie_sum      = data["calorie_sum"],
        carb_sum         = data["carb_sum"],
        protein_sum      = data["protein_sum"],
        fat_sum          = data["fat_sum"]
    )
    db.session.add(new_rec)
    db.session.commit()
    log_debug(f"[SUCCESS] Record created with ID: {new_rec.id}")
    return jsonify(new_rec.to_dict()), 201

@app.route("/diet-records/<int:id>", methods=["PUT"])
def update_diet_record(id):
    log_debug(f"[REQUEST] PUT /diet-records/{id}: Received a request to update record.")
    require_login()
    uid = session['user_id']
    
    record = DietRecord.query.get_or_404(id)
    if record.user_id != uid:
        abort(403, description="沒有權限")

    data = request.get_json() or {}
    log_debug(f"User '{uid}' is updating record '{id}'. Raw JSON payload received:\n{data}")
    
    if "record_time" in data:
        try:
            record.record_time = datetime.fromisoformat(data["record_time"])
        except (ValueError, TypeError):
            abort(400, description="record_time 格式需為 ISO 字串 (YYYY-MM-DDTHH:MM)")
    if "qty" in data:
        try:
            record.qty = float(data["qty"])
        except (ValueError, TypeError):
            abort(400, description="qty 需為數字")

    for field in ["official_food_id", "custom_food_id", "calorie_sum", "carb_sum", "protein_sum", "fat_sum"]:
        if field in data:
            setattr(record, field, data[field])
            
    db.session.commit()
    log_debug(f"[SUCCESS] Record {id} updated successfully.")
    return jsonify(record.to_dict())

@app.route("/diet-records/<int:id>", methods=["DELETE"])
def delete_diet_record(id):
    log_debug(f"[REQUEST] DELETE /diet-records/{id}: Received a request to delete record.")
    require_login()
    uid = session['user_id']
    record = DietRecord.query.get_or_404(id)
    if record.user_id != uid:
        abort(403, description="沒有權限")
        
    db.session.delete(record)
    db.session.commit()
    log_debug(f"[SUCCESS] Record {id} deleted by user '{uid}'.")
    return "", 204

# --- 應用程式啟動 ---
if __name__ == "__main__":
    # 首次啟動若未建立資料表，請取消下面這行的註解
    # with app.app_context(): db.create_all()
    app.run(debug=True, host="127.0.0.1", port=1133)
