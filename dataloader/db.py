import json
import os

from sqlalchemy import create_engine, text
from contextlib import contextmanager
from aws_lambda_powertools.utilities import parameters

DB_SECRET_NAME = os.environ["DB_SECRET_NAME"]
DB_HOSTNAME = os.environ["DB_HOSTNAME"]
DB_PORT = int(os.environ["DB_PORT"])
DB_NAME = os.environ["DB_NAME"]
secret = json.loads(parameters.get_secret(DB_SECRET_NAME, max_age=60))
database_url = f"postgresql+psycopg2://{secret['username']}:{secret['password']}@{DB_HOSTNAME}:{DB_PORT}/{DB_NAME}"
engine = create_engine(database_url, pool_size=5, max_overflow=10)


def exec_sql(conn, sql, params):
    result = conn.execute(text(sql), params)  # 信頼できないソースからのSQLは実行しないでください
    return result


@contextmanager
def db_cursor(autocommit=False):
    conn = engine.connect()
    if not autocommit:
        trans = conn.begin()
    try:
        yield conn
        if not autocommit:
            trans.commit()
    except Exception as e:
        if not autocommit:
            trans.rollback()
        raise e
    finally:
        conn.close()
