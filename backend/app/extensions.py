from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect
from sqlalchemy import MetaData

db = SQLAlchemy(metadata=MetaData(naming_convention={"ix":"ix_%(table_name)s_%(column_0_name)s", "fk":"fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"}))
migrate = Migrate()
login = LoginManager()
csrf = CSRFProtect()
