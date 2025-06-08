# calorie-web
## 簡介
這是一個給用戶紀錄每日卡路里攝取的網站

## 除錯
```
nohup  python3 -m http.server 5000 --bind 127.0.0.1 > front.log 2>&1 &

```

## UI 
```
cd front
python3 -m http.server 5000 --bind 127.0.0.1
```
 
## FOOD API
### 安裝必要套件
```
pip install -r requirements.txt
```
### 環境變數
你需要自建環境變數設定檔`.env`
> 記得建立`.gitignore`，然後在裡面加入`.env`
```
DB_USER=calorie_db
DB_PASSWORD=CvXmcorwWGJMSJ7
DB_HOST=localhost
DB_PORT=3306
DB_NAME=calorie
```
### 測試API
- 取得所有食物
```
curl -X GET http://127.0.0.1:1111/foods
```
- 取得特定食物
```
curl -X GET http://127.0.0.1:1111/foods/1
```
- 新增食物
```
curl -X POST http://127.0.0.1:1111/foods \
  -H "Content-Type: application/json" \
  -d '{
        "name": "雞胸肉",
        "calories": 165,
        "protein": 31,
        "fat": 3.6,
        "carbs": 0
      }'
```
- 更新指定食物
```
curl -X PUT http://127.0.0.1:1111/foods/1 \
  -H "Content-Type: application/json" \
  -d '{
        "name": "雞胸肉（200g）",
        "calories": 330
      }'
```
- 刪除指定食物
```
curl -X DELETE http://127.0.0.1:1111/foods/1
```
## db 設定
0. 登入db
```
sudo mysql
```
1. 建立db
```
CREATE DATABASE calorie_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE calorie;
```
2. 建表
```
-- 用戶表
CREATE TABLE user (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(200) NOT NULL
);
-- 食物表
CREATE TABLE food (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    calories FLOAT NOT NULL,
    protein FLOAT NOT NULL,
    fat FLOAT NOT NULL,
    carbs FLOAT NOT NULL
);

--用戶自訂食物表
CREATE TABLE customer_food (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    user_id   INT NOT NULL,
    name      VARCHAR(100) NOT NULL,
    calories  FLOAT NOT NULL,
    protein   FLOAT NOT NULL,
    fat       FLOAT NOT NULL,
    carbs     FLOAT NOT NULL,
    UNIQUE KEY uq_user_foodname (user_id, name),
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

-- 紀錄表
CREATE TABLE diet_record (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  user_id           INT NOT NULL,
  record_time       DATETIME NOT NULL,
  qty               FLOAT NOT NULL DEFAUT 1,
  official_food_id  INT NULL,
  custom_food_id    INT NULL,
  calorie_sum       FLOAT NOT NULL,
  carb_sum          FLOAT NOT NULL,
  protein_sum       FLOAT NOT NULL,
  fat_sum           FLOAT NOT NULL,

  CONSTRAINT fk_dietrecord_user
    FOREIGN KEY (user_id)          REFERENCES user(id)          ON DELETE CASCADE,
  CONSTRAINT fk_dietrecord_official
    FOREIGN KEY (official_food_id) REFERENCES food(id)          ON DELETE SET NULL,
  CONSTRAINT fk_dietrecord_custom
    FOREIGN KEY (custom_food_id)   REFERENCES customer_food(id) ON DELETE SET NULL

);

```



3. 測試
```
-- 插入用戶
INSERT INTO user (username, password) VALUES 
('alice', 'hashed_password_123'),
('bob', 'hashed_password_456');

-- 插入食物
INSERT INTO food (name, calories, protein, fat, carbs) VALUES
('雞胸肉', 165, 31, 3.6, 0),
('白飯', 130, 2.7, 0.3, 28),
('蘋果', 52, 0.3, 0.2, 14);

-- 新增自訂食物
INSERT INTO customer_food (
    user_id, name, calories, protein, fat, carbs
) VALUES (
    1, '自製蛋餅', 150, 5, 2, 25
);

-- 新增紀錄
INSERT INTO diet_record (
  user_id, record_time, qty, official_food_id,
  calorie_sum, carb_sum, protein_sum, fat_sum
) VALUES (
  1, NOW(), 1, 1,
  300, 40, 20, 10
);

INSERT INTO diet_record (
  user_id, record_time, qty, custom_food_id,
  calorie_sum, carb_sum, protein_sum, fat_sum
) VALUES (
  1, NOW(), 1, 1,
  150, 25, 5, 2
);

select * from user;
select * from food;
select * from customer_food;
select * from diet_record
```
4. 建立 MySQL user
```
sudo mysql -u root -p
CREATE USER 'calorie'@'localhost' IDENTIFIED BY 'your_password';

GRANT SELECT, INSERT, UPDATE, DELETE ON calorie_db.user           TO 'calorie'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON calorie_db.customer_food  TO 'calorie'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON calorie_db.food           TO 'calorie'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON calorie_db.diet_record    TO 'calorie'@'localhost';
FLUSH PRIVILEGES;


CREATE USER 'calorie_admin'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON calorie_db.* TO 'calorie_admin'@'localhost';-- 開calorie_db所有權限給calorie admin

FLUSH PRIVILEGES;-- 套用權限變更
-- 用calorie 登入
mysql -u calorie -p 
```
## git branch 用法
1.查看目前branch
```
git branch
```

2.切ranch
```
git checkout -b 新分支名稱
```

3.做你的修改，然後加入暫存區 & commit
```
git add .
git commit -m "新增 counter-service 功能"
```

4.將分支推到 GitHub
```
git push origin 新分支名稱
```


