# food.py
from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
import os
from flask import render_template

app = Flask(__name__)

# 讀取 .env 檔案的環境變數
load_dotenv()
user = os.getenv('DB_USER')
password = os.getenv('DB_PASSWORD')
host = os.getenv('DB_HOST', 'localhost')
port = os.getenv('DB_PORT', '3306')
dbname = os.getenv('DB_NAME')

# MySQL connection: replace user, password, host, port, database
app.config['SQLALCHEMY_DATABASE_URI'] = f'mysql+pymysql://{user}:{password}@{host}:{port}/{dbname}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
# CREATE USER 'calorie'@'localhost' IDENTIFIED BY 'CvXmcorwWGJMSJ7';

db = SQLAlchemy(app)

class Food(db.Model):
    __tablename__ = 'food'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    calories = db.Column(db.Float, nullable=False)
    protein = db.Column(db.Float, nullable=False)
    fat = db.Column(db.Float, nullable=False)
    carbs = db.Column(db.Float, nullable=False)
    
    def __init__(self, name, calories, protein, fat, carbs):
        self.name = name
        self.calories = calories
        self.protein = protein
        self.fat = fat
        self.carbs = carbs
    

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'calories': self.calories,
            'protein': self.protein,
            'fat': self.fat,
            'carbs': self.carbs
        }
        
        
@app.route('/')
def index():
    return render_template('index.html')

# RESTful API endpoints
@app.route('/foods', methods=['GET'])
def get_foods():
    foods = Food.query.all()
    return jsonify([f.to_dict() for f in foods])

@app.route('/foods/<string:name>', methods=['GET'])
def get_food_by_name(name):
    f = Food.query.filter_by(name=name).first()
    if not f:
        return jsonify({'error': '找不到該食物'}), 404
    return jsonify(f.to_dict())

@app.route('/foods', methods=['POST'])
def create_food():
    data = request.get_json()
    f = Food(
        name=data['name'],
        calories=data['calories'],
        protein=data['protein'],
        fat=data['fat'],
        carbs=data['carbs']
    )
    try:
        db.session.add(f)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({'message': '新增失敗：食物名稱已存在'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': '新增失敗：伺服器錯誤'}), 500

    return jsonify(f.to_dict()), 201

@app.route('/foods/<int:id>', methods=['PUT'])
def update_food(id):
    f = Food.query.get_or_404(id)
    data = request.get_json()
    f.name = data.get('name', f.name)
    f.calories = data.get('calories', f.calories)
    f.protein = data.get('protein', f.protein)
    f.fat = data.get('fat', f.fat)
    f.carbs = data.get('carbs', f.carbs)
    db.session.commit()
    return jsonify(f.to_dict())

@app.route('/foods/<int:id>', methods=['DELETE'])
def delete_food(id):
    f = Food.query.get_or_404(id)
    db.session.delete(f)
    db.session.commit()
    return '', 204

if __name__ == '__main__':
    # 初始化資料表 (第一次執行時註解)
    # with app.app_context():
    #     db.create_all()
    app.run(debug=True,host='127.0.0.1',port=1111)

# requirements.txt
# flask
# flask_sqlalchemy
# pymysql
