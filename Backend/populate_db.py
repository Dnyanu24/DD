from app.database import SessionLocal
from app.models import User, Sector, Product, Company
from app.dependencies import get_password_hash

def populate_db():
    db = SessionLocal()
    try:
        # Create company
        company = Company(name="Test Company", description="A test company for SDAS")
        db.add(company)
        db.commit()

        # Create sectors
        sectors = [
            Sector(name="Sales", company_id=company.id),
            Sector(name="Marketing", company_id=company.id),
            Sector(name="Operations", company_id=company.id)
        ]
        for sector in sectors:
            db.add(sector)
        db.commit()

        # Create products
        products = [
            Product(name="Product A", sector_id=sectors[0].id),
            Product(name="Product B", sector_id=sectors[0].id),
            Product(name="Service X", sector_id=sectors[1].id)
        ]
        for product in products:
            db.add(product)
        db.commit()

        # Create users
        users = [
            User(username="ceo", password_hash=get_password_hash("pass"), role="ceo", company_id=company.id),
            User(username="sector_head_sales", password_hash=get_password_hash("pass"), role="sector_head", sector_id=sectors[0].id, company_id=company.id),
            User(username="data_analyst", password_hash=get_password_hash("pass"), role="data_analyst", company_id=company.id),
            User(username="admin", password_hash=get_password_hash("pass"), role="admin", company_id=company.id)
        ]
        for user in users:
            db.add(user)
        db.commit()

        print("Database populated successfully!")

    except Exception as e:
        print(f"Error populating database: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    populate_db()
