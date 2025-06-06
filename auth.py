# auth.py (獨立登入/註冊 API，監聽在 5001)
from flask import Flask, render_template, request, redirect, url_for, session, flash
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
import os
from werkzeug.security import generate_password_hash, check_password_hash

# 載入 .env
load_dotenv()
DB_USER     = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST     = os.getenv("DB_HOST", "localhost")
DB_PORT     = os.getenv("DB_PORT", "3306")
DB_NAME     = os.getenv("DB_NAME")
SECRET_KEY  = os.getenv("SECRET_KEY", "dev_secret_key")
AUTH_BASE  = os.getenv("AUTH_BASE", "http://127.0.0.1:5001")

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = (
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = SECRET_KEY

db = SQLAlchemy(app)

# User 模型
table_args = {
    'mysql_engine': 'InnoDB',
    'mysql_charset': 'utf8mb4'
}
class User(db.Model):
    __tablename__ = "user"
    __table_args__ = (table_args,)
    id            = db.Column(db.Integer, primary_key=True)
    username      = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column("password", db.String(200), nullable=False)

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        if not username or not password:
            flash('請輸入使用者名稱與密碼。')
            return redirect(url_for('signup'))
        existing = User.query.filter_by(username=username).first()
        if existing:
            flash('此使用者名稱已被註冊。')
            return redirect(url_for('signup'))
        hashed = generate_password_hash(password)
        new_user = User(username=username, password_hash=hashed)
        db.session.add(new_user)
        db.session.commit()
        # 註冊成功後 flash 提示並導回登入
        flash('已成功註冊，請重新登入。')
        return redirect(url_for('login'))
    return render_template('signup.html')
    
@app.route('/', methods=['GET', 'POST'])    
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        user = User.query.filter_by(username=username).first()
        if user and check_password_hash(user.password_hash, password):
            session.clear()
            session['user_id'] = user.id
            flash('登入成功')
            # 登入成功後將使用者導回前端主畫面
            return redirect(os.getenv('FRONTEND_BASE', 'http://127.0.0.1:5000'))
        flash('帳號或密碼錯誤。')
        return redirect(url_for('login'))

    return render_template('login.html')
    
@app.route('/logout')
def logout():
    session.clear()
    flash('已登出')
    # 直接導向 Auth 服務的登入頁：使用環境變數 FRONTEND_BASE（若有）或硬寫 5001/login
    return redirect(os.getenv('AUTH_BASE', 'http://127.0.0.1:5001') + '/login')

if __name__ == '__main__':
    # 若尚未建表，可先執行：
    #   from auth import db, app
    #   with app.app_context():
    #       db.create_all()
    app.run(debug=True, port=5001)

