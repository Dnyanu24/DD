from app.database import SessionLocal
from app.models import User, Sector, Product, Company, RawData, CleanedData, AIPrediction, AIRecommendation, PipelineIterationLog
from app.dependencies import get_password_hash

def populate_db():
    db = SessionLocal()
    try:
        # Update passwords if exists
        users = db.query(User).all()
        for user in users:
            user.password_hash = get_password_hash("admin123")
        db.commit()

        # Create if empty
        if not db.query(Company).first():
            company = Company(name="Test Company", description="SDAS Demo")
            db.add(company)
            db.commit()

            sectors = [
                Sector(name="Sales", company_id=company.id),
                Sector(name="Marketing", company_id=company.id),
                Sector(name="Operations", company_id=company.id)
            ]
            db.add_all(sectors)
            db.commit()

            products = [
                Product(name="Product A", sector_id=sectors[0].id),
                Product(name="Product B", sector_id=sectors[0].id),
                Product(name="Service X", sector_id=sectors[1].id)
            ]
            db.add_all(products)
            db.commit()

            users = [
                User(username="ceo", password_hash=get_password_hash("admin123"), role="ceo", company_id=company.id),
                User(username="sector_head_sales", password_hash=get_password_hash("admin123"), role="sector_head", sector_id=sectors[0].id, company_id=company.id),
                User(username="data_analyst", password_hash=get_password_hash("admin123"), role="data_analyst", company_id=company.id),
                User(username="admin", password_hash=get_password_hash("admin123"), role="admin", company_id=company.id),
                User(username="sales_manager", password_hash=get_password_hash("admin123"), role="sales_manager", company_id=company.id)
            ]
            db.add_all(users)
            db.commit()

        # Sample RawData (30 sales, 25 marketing, 20 ops)
        sales_data = [
            {'date': f'2024-01-{i:02d}', 'product': 'Product A' if i%2==0 else 'Product B', 'revenue': 12000 + i*200.0, 'units': 140 + i%10, 'region': 'North' if i%3==0 else 'Europe'},
            {'date': f'2024-02-{i:02d}', 'product': 'Product B', 'revenue': 13500 + i*150.0, 'units': 160, 'region': 'Asia'}
        for i in range(1,31)]
        sales_data = sales_data[:30]

        marketing_data = [
            {'date': f'2024-01-{i:02d}', 'campaign': 'Email' if i%2==0 else 'Social', 'spend': 2000 + i*50.0, 'leads': 40 + i%20, 'conversion': round(0.08 + i*0.002, 3)}
        for i in range(1,26)]
        marketing_data = marketing_data[:25]

        ops_data = [
            {'date': f'2024-01-{i:02d}', 'category': 'Labor' if i%3==0 else 'Materials', 'cost': 8000 + i*100.0, 'hours': None if i%5==0 else 380 + i*5, 'efficiency': 88 + i%5}
        for i in range(1,21)]
        ops_data = ops_data[:20]

        raw_sales = RawData(sector_id=sectors[0].id, product_id=products[0].id, data=sales_data, uploaded_by=users[2].id)  # data_analyst
        raw_marketing = RawData(sector_id=sectors[1].id, product_id=products[2].id, data=marketing_data, uploaded_by=users[2].id)
        raw_ops = RawData(sector_id=sectors[2].id, data=ops_data, uploaded_by=users[2].id)

        db.add_all([raw_sales, raw_marketing, raw_ops])
        db.flush()  # IDs

        # CleanedData
        cleaned_sales = [{'date': r['date'], 'product': r['product'], 'revenue': r['revenue'], 'units': r['units'], 'region': r['region']} for r in sales_data]
        cleaned_marketing = [{'date': r['date'], 'campaign': r['campaign'], 'spend': r['spend'], 'leads': r['leads'], 'conversion': r['conversion']} for r in marketing_data]
        cleaned_ops = [{'date': r['date'], 'category': r['category'], 'cost': r['cost'], 'hours': 400.0 if r['hours'] is None else r['hours'], 'efficiency': r['efficiency']} for r in ops_data]

        cleaned_sales_entry = CleanedData(raw_data_id=raw_sales.id, cleaned_data=cleaned_sales, cleaning_algorithm='full_pipeline', quality_score=0.95)
        cleaned_marketing_entry = CleanedData(raw_data_id=raw_marketing.id, cleaned_data=cleaned_marketing, cleaning_algorithm='full_pipeline', quality_score=0.92)
        cleaned_ops_entry = CleanedData(raw_data_id=raw_ops.id, cleaned_data=cleaned_ops, cleaning_algorithm='full_pipeline', quality_score=0.88)

        db.add_all([cleaned_sales_entry, cleaned_marketing_entry, cleaned_ops_entry])
        db.flush()

        # AIPredictions & Recs
        pred_sales = AIPrediction(sector_id=sectors[0].id, prediction_type='sales_forecast', prediction_data={'growth': 12.5, 'timeline': ['Jan': 12500, 'Feb': 14200]}, confidence=0.88)
        pred_marketing = AIPrediction(sector_id=sectors[1].id, prediction_type='trend_analysis', prediction_data={'trend': 'increasing', 'r': 0.85}, confidence=0.85)
        pred_ops = AIPrediction(sector_id=sectors[2].id, prediction_type='risk_assessment', prediction_data={'risk_level': 'low', 'confidence': 0.91}, confidence=0.91)

        db.add_all([pred_sales, pred_marketing, pred_ops])
        db.flush()

        rec_sales = AIRecommendation(prediction_id=pred_sales.id, recommendation_text='Invest in Product A - 12.5% growth forecast', explanation='Strong revenue trend in North/Europe.')
        rec_marketing = AIRecommendation(prediction_id=pred_marketing.id, recommendation_text='Scale Social campaigns', explanation='0.85 correlation spend-leads.')
        rec_ops = AIRecommendation(prediction_id=pred_ops.id, recommendation_text='Maintain current Operations efficiency', explanation='Low risk, 91% confidence.')

        db.add_all([rec_sales, rec_marketing, rec_ops])

        # Logs
        log_clean = PipelineIterationLog(company_id=company.id, task='cleaning_sales', status='completed', metrics={'quality': 0.95}, run_key='sales_clean_001')
        log_pred = PipelineIterationLog(company_id=company.id, task='prediction_marketing', status='completed', metrics={'confidence': 0.88}, run_key='mk_pred_001')

        db.add_all([log_clean, log_pred])
        db.commit()

        print("✓ Demo DB populated!")
        print("Users: ceo/admin/data_analyst/sector_head_sales/sales_manager (pw: admin123)")
        print("Data: 3 RawData (75 rows), 3 Cleaned (95% qual), 3 Preds, 3 Recs, Logs.")
        print("Next: Backend dev → Frontend dev → Test dashboards.")

    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    populate_db()

