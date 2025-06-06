import os
from passlib.context import CryptContext
import pymysql
from dotenv import load_dotenv

# 1. 載入 .env（取得 DB 連線參數）
load_dotenv()

# 2. 設定 Argon2 雜湊上下文
pwd_ctx = CryptContext(schemes=["argon2"], deprecated="auto")

# 3. 你要更新的管理員帳號與明文密碼
username = "admin01"
plain_password = "Password123!"

# 4. 產生雜湊
hashed_password = pwd_ctx.hash(plain_password)
print("Generated Argon2 hash:", hashed_password)

# 5. 連到 MySQL，請用 .env 的值或自行改成你的連線設定
DB_USER     = os.getenv("DB_USER", "test")
DB_PASSWORD = os.getenv("DB_PASSWORD", "nmsl2486Cnmb!")
DB_HOST     = os.getenv("DB_HOST", "localhost")
DB_PORT     = int(os.getenv("DB_PORT", 3306))
DB_NAME     = os.getenv("DB_NAME", "calorie_db")

conn = pymysql.connect(
    host=DB_HOST,
    user=DB_USER,
    password=DB_PASSWORD,
    db=DB_NAME,
    port=DB_PORT,
    charset="utf8mb4"
)
cursor = conn.cursor()

# 6. 更新 admin 表裡對應 username 的 password 欄位
sql = "UPDATE admin SET password=%s WHERE username=%s"
cursor.execute(sql, (hashed_password, username))
conn.commit()

print(f"資料庫已更新，{username} 的密碼欄位已改為 Argon2 雜湊。")

cursor.close()
conn.close()

