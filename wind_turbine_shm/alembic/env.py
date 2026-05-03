from logging.config import fileConfig
import os
from sqlalchemy import engine_from_config
from sqlalchemy import pool
from alembic import context

# Імпортуємо нашу конфігурацію бази даних і моделі
from src.database.config import Base, DATABASE_URL
from src.database import models

# Це об'єкт Alembic Config, який надає
# доступ до значень з використаного .ini-файлу.
config = context.config

# Інтерпретуємо конфігураційний файл для логування Python.
# Цей рядок, по суті, налаштовує логери.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Встановлюємо sqlalchemy.url зі змінної середовища
if not config.get_main_option("sqlalchemy.url"):
    config.set_main_option("sqlalchemy.url", DATABASE_URL)

# Додайте сюди MetaData об'єкт вашої моделі
# для підтримки 'autogenerate'
target_metadata = Base.metadata

# Інші значення з конфігурації, визначені потребами env.py,
# можна отримати так:
# my_important_option = config.get_main_option("my_important_option")
# ... тощо.


def run_migrations_offline() -> None:
    """Виконує міграції в режимі 'offline'.

    Налаштовує контекст лише за URL без Engine,
    хоча Engine тут також допустимий. Пропускаючи створення Engine,
    нам навіть не потрібен доступний DBAPI.

    Виклики context.execute() тут виводять заданий рядок у
    вихід скрипту.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Виконує міграції в режимі 'online'.

    У цьому сценарії потрібно створити Engine
    та пов'язати з'єднання з контекстом.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
