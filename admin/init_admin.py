from auth_admin import db, Admin, app
from werkzeug.security import generate_password_hash

with app.app_context():
    admin = Admin.query.filter_by(username="pyparty").first()
    if admin:
        admin.password_hash = generate_password_hash("emp666")
        db.session.commit()
        print("已將 admin 密碼更新為雜湊版本")
    else:
        print("找不到 admin 用戶")

