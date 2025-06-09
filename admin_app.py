# admin_app.py  -------------------------------
from flask import Flask, request, jsonify, session
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
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
FRONT_ORIGIN= os.getenv("ADMIN_FRONTEND_BASE", "http://127.0.0.1:5000")

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = (
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = SECRET_KEY
CORS(app, supports_credentials=True, origins=[FRONT_ORIGIN])

db = SQLAlchemy(app)

# -------- Models (只引必要欄位) --------
class Food(db.Model):
    __tablename__ = "food"
    id        = db.Column(db.Integer, primary_key=True)
    name      = db.Column(db.String(100))
    calories  = db.Column(db.Float)
    protein   = db.Column(db.Float)
    fat       = db.Column(db.Float)
    carbs     = db.Column(db.Float)

    def to_dict(self):
        return {
            "id": self.id, "name": self.name,
            "calories": self.calories, "protein": self.protein,
            "fat": self.fat, "carbs": self.carbs
        }

# -------- 登入檢查 decorator --------
def admin_required(fn):
    def wrapper(*args, **kwargs):
        if not session.get("admin_id"):
            return jsonify({"msg": "未登入 admin"}), 401
        return fn(*args, **kwargs)
    wrapper.__name__ = fn.__name__
    return wrapper

# -------- CRUD API --------
@app.get("/foods")
@admin_required
def list_foods():
    # 從 URL query string 取得 name 參數
    query_name = request.args.get('name', '')
    
    query = Food.query
    
    # 如果 query_name 不是空的，就加入篩選條件
    if query_name:
        # 使用 ilike 進行不分大小寫的模糊查詢
        query = query.filter(Food.name.ilike(f"%{query_name}%"))
        
    foods = query.order_by(Food.id).all()
    
    return jsonify([f.to_dict() for f in foods])

@app.post("/foods")
@admin_required
def add_food():
    d = request.get_json(force=True)
    req = {"name", "calories", "protein", "fat", "carbs"}
    if not req.issubset(d):
        return jsonify({"msg": f"缺少欄位 {req - d.keys()}"}), 400
    f = Food(**d)
    db.session.add(f); db.session.commit()
    return jsonify(f.to_dict()), 201

@app.put("/foods/<int:fid>")
@admin_required
def update_food(fid):
    f = Food.query.get_or_404(fid)
    data = request.get_json(force=True)
    for k in ["name", "calories", "protein", "fat", "carbs"]:
        if k in data:
            setattr(f, k, data[k])
    db.session.commit()
    return jsonify(f.to_dict())

@app.delete("/foods/<int:fid>")
@admin_required
def delete_food(fid):
    f = Food.query.get_or_404(fid)
    db.session.delete(f); db.session.commit()
    return "", 204

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5003)

