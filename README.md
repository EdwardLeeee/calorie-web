# calorie-web
## 簡介
這是一個給用戶紀錄每日卡路里攝取的網站
## db 設定
0. 登入db
```
sudo mysql
```
1.建立db
```
CREATE DATABASE calorie_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE calorie_db;
```
2.建表
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

-- 紀錄表
CREATE TABLE diet_record (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    food_id INT NOT NULL,
    quantity FLOAT NOT NULL DEFAULT 1.0,
    record_date DATE NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (food_id) REFERENCES food(id) ON DELETE CASCADE
);
```

3.測試
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

-- 插入飲食紀錄（假設 alice 的 id 是 1，bob 是 2）
INSERT INTO diet_record (user_id, food_id, quantity, record_date) VALUES
(1, 1, 1.0, '2025-05-01'), -- Alice 吃了一份雞胸肉
(1, 2, 1.5, '2025-05-01'), -- Alice 吃了1.5碗白飯
(2, 3, 2.0, '2025-05-01'); -- Bob 吃了兩顆蘋果


select * from user;
select * from food;
select * from diet_record
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


