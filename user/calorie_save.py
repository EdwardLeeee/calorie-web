# user_settings_service.py (修正後，與 auth.py, diet_record.py 相容)

import os
from flask import Flask, request, jsonify, session, abort
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from dotenv import load_dotenv
import logging

# --- 初始化與設定 ---

# 設定日誌
logging.basicConfig(level=logging.INFO)

# 載入 .env 檔案中的環境變數
load_dotenv()

# 建立 Flask App
app = Flask(__name__)

# --- App 組態設定 ---

# 【修改】移除所有 Flask-Session 相關設定
# 【保留】只留下和 auth.py, diet_record.py 完全相同的 SQLAlchemy 和 SECRET_KEY 設定
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")

# 【關鍵】使用和 auth.py, diet_record.py 完全相同的 SECRET_KEY
# 這是讓所有服務能共享 Session 的鑰匙
app.config['SECRET_KEY'] = os.getenv("SECRET_KEY", "dev_secret_key")

# 【關鍵】使用和 auth.py, diet_record.py 相似的資料庫連線字串
# 注意: 你的 auth.py 和 diet_record.py 使用的驅動是 'pymysql'
# 為了統一，這裡也改用 'pymysql'
app.config['SQLALCHEMY_DATABASE_URI'] = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# 【移除】不再需要 Flask-Session，所以移除 Session(app)
db = SQLAlchemy(app)

# 【關鍵】設定和 auth.py, diet_record.py 完全相同的 CORS 來源
# 你的 auth 和 record 服務設定為 "http://127.0.0.1:5000"，這裡也必須一樣
CORS(app, supports_credentials=True, origins=["http://127.0.0.1:5000"])


# --- SQLAlchemy 資料庫模型 (Model) ---

class User(db.Model):
    __tablename__ = 'user'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    # 你的 auth.py 中，欄位名是 password_hash，但對應到資料庫是 'password'
    # 這裡保持一致，以確保 SQLAlchemy 能正確對應
    password = db.Column("password", db.String(200), nullable=False)
    target_kcal = db.Column(db.Integer, nullable=False, default=2000)

    def __repr__(self):
        return f'<User {self.username}>'

# --- 輔助函式 ---
def require_login():
    """一個和 diet_record.py 中一樣的輔助函式，用來檢查登入狀態"""
    if 'user_id' not in session:
        abort(401, description="使用者未登入")

# --- API 路由 ---

@app.route('/user-settings', methods=['GET'])
def get_user_settings():
    require_login() # 檢查登入
    user_id = session['user_id']
    
    try:
        user = db.session.get(User, user_id)
        if user:
            return jsonify({"target_kcal": user.target_kcal})
        else:
            return jsonify({"error": "找不到該使用者"}), 404
    except Exception as e:
        logging.error(f"資料庫查詢失敗: {e}")
        return jsonify({"error": "伺服器內部錯誤"}), 500

@app.route('/user-settings', methods=['PUT'])
def update_user_settings():
    require_login() # 檢查登入
    user_id = session['user_id']
    
    data = request.get_json()
    if not data:
        return jsonify({"error": "請求中缺少 JSON 資料"}), 400
        
    new_kcal = data.get('target_kcal')

    if not isinstance(new_kcal, int) or new_kcal <= 0:
        return jsonify({"error": "目標卡路里必須是正整數"}), 400

    try:
        user_to_update = db.session.get(User, user_id)
        if not user_to_update:
            return jsonify({"error": "更新失敗，找不到該使用者"}), 404

        user_to_update.target_kcal = new_kcal
        db.session.commit()
        return jsonify({"message": "設定更新成功"}), 200
    except Exception as e:
        db.session.rollback()
        logging.error(f"資料庫更新失敗: {e}")
        return jsonify({"error": "伺服器內部錯誤"}), 500

# --- 啟動伺服器 ---

if __name__ == '__main__':
    # 你可以為這個新服務選擇一個未被使用的 port，例如 1144
    app.run(debug=True, port=1144)

