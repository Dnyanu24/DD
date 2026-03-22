
from sqlalchemy import Column, Integer, String, Text, JSON, DateTime, Float, ForeignKey, Index, DDL
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

# Company Model 
class Company(Base):
    __tablename__ = "companies"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    sectors = relationship("Sector", back_populates="company")
    users = relationship("User", back_populates="company")
    join_requests = relationship("CompanyJoinRequest", back_populates="company")

# Sector Model
class Sector(Base):
    __tablename__ = "sectors"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    company = relationship("Company", back_populates="sectors")
    products = relationship("Product", back_populates="sector")
    raw_data = relationship("RawData", back_populates="sector")
    users = relationship("User", back_populates="sector")

# Product Model
class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    sector = relationship("Sector", back_populates="products")

# User Model (for roles)
class User(Base):
    __tablename__ = "users_roles"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False)  # sector_head, ceo
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=True)  # for sector_head
    created_at = Column(DateTime, default=datetime.utcnow)

    company = relationship("Company", back_populates="users")
    sector = relationship("Sector", back_populates="users")
    reviewed_requests = relationship("CompanyJoinRequest", back_populates="reviewer")


class CompanyJoinRequest(Base):
    __tablename__ = "company_join_requests"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    requested_role = Column(String(50), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=True)
    status = Column(String(20), nullable=False, default="pending")  # pending, approved, rejected
    reviewed_by = Column(Integer, ForeignKey("users_roles.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    company = relationship("Company", back_populates="join_requests")
    sector = relationship("Sector")
    reviewer = relationship("User", back_populates="reviewed_requests")

# Raw Data Model
class RawData(Base):
    __tablename__ = "raw_data"
    id = Column(Integer, primary_key=True, index=True)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    data = Column(JSON, nullable=False)  # Raw data as JSON
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    uploaded_by = Column(Integer, ForeignKey("users_roles.id"), nullable=False)

    sector = relationship("Sector", back_populates="raw_data")
    cleaned_data = relationship("CleanedData", back_populates="raw_data")

# Cleaned Data Model
class CleanedData(Base):
    __tablename__ = "cleaned_data"
    id = Column(Integer, primary_key=True, index=True)
    raw_data_id = Column(Integer, ForeignKey("raw_data.id"), nullable=False)
    cleaned_data = Column(JSON, nullable=False)
    cleaning_algorithm = Column(String(255), nullable=False)
    quality_score = Column(Float, nullable=False)
    cleaned_at = Column(DateTime, default=datetime.utcnow)

    raw_data = relationship("RawData", back_populates="cleaned_data")
    quality_scores = relationship("DataQualityScore", back_populates="cleaned_data")

# Data Quality Score Model
class DataQualityScore(Base):
    __tablename__ = "data_quality_scores"
    id = Column(Integer, primary_key=True, index=True)
    cleaned_data_id = Column(Integer, ForeignKey("cleaned_data.id"), nullable=False)
    score = Column(Float, nullable=False)
    algorithm = Column(String(255), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    cleaned_data = relationship("CleanedData", back_populates="quality_scores")

# AI Prediction Model
class AIPrediction(Base):
    __tablename__ = "ai_predictions"
    id = Column(Integer, primary_key=True, index=True)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    prediction_type = Column(String(255), nullable=False)  # e.g., sales_forecast, anomaly
    prediction_data = Column(JSON, nullable=False)
    confidence = Column(Float, nullable=False)
    predicted_at = Column(DateTime, default=datetime.utcnow)

    recommendations = relationship("AIRecommendation", back_populates="prediction")

# AI Recommendation Model
class AIRecommendation(Base):
    __tablename__ = "ai_recommendations"
    id = Column(Integer, primary_key=True, index=True)
    prediction_id = Column(Integer, ForeignKey("ai_predictions.id"), nullable=False)
    recommendation_text = Column(Text, nullable=False)
    explanation = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    prediction = relationship("AIPrediction", back_populates="recommendations")

# Report Model
class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    date = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

# Feedback Log Model
class FeedbackLog(Base):
    __tablename__ = "feedback_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users_roles.id"), nullable=False)
    data_id = Column(Integer, nullable=False)  # Could reference raw_data or cleaned_data
    feedback_type = Column(String(50), nullable=False)  # correction, validation
    feedback_data = Column(JSON, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)


class CompanyAnnouncement(Base):
    __tablename__ = "company_announcements"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    created_by = Column(Integer, ForeignKey("users_roles.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class CompanyReport(Base):
    __tablename__ = "company_reports"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    title = Column(String(255), nullable=False)
    report_type = Column(String(100), nullable=False)
    payload = Column(JSON, nullable=False)
    created_by = Column(Integer, ForeignKey("users_roles.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class UserSetting(Base):
    __tablename__ = "user_settings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users_roles.id"), unique=True, nullable=False)
    settings = Column(JSON, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow)


class SavedCleanedDataset(Base):
    __tablename__ = "saved_cleaned_datasets"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    created_by = Column(Integer, ForeignKey("users_roles.id"), nullable=False)
    source_cleaned_data_id = Column(Integer, ForeignKey("cleaned_data.id"), nullable=True)
    filename = Column(String(255), nullable=True)
    columns = Column(JSON, nullable=False, default=list)
    row_count = Column(Integer, nullable=False, default=0)
    data = Column(JSON, nullable=False)  # Preview rows stored for later visualization
    created_at = Column(DateTime, default=datetime.utcnow)


class UserProfile(Base):
    __tablename__ = "user_profiles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users_roles.id"), unique=True, nullable=False)
    display_name = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True)
    bio = Column(Text, nullable=True)
    avatar_filename = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users_roles.id"), nullable=False)
    token_hash = Column(String(128), nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PipelineIterationLog(Base):
    __tablename__ = "pipeline_iteration_logs"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=True)
    task = Column(String(64), nullable=False)  # e.g. risk_prediction
    run_key = Column(String(128), nullable=False)  # groups related iterations
    iteration = Column(Integer, nullable=False, default=0)
    status = Column(String(32), nullable=False, default="completed")  # completed | stopped | error
    metrics = Column(JSON, nullable=False, default=dict)
    previous_metrics = Column(JSON, nullable=True)
    dataset_stats = Column(JSON, nullable=False, default=dict)
    cleaning_config = Column(JSON, nullable=False, default=dict)
    root_cause = Column(JSON, nullable=False, default=dict)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class MetaLearningExperience(Base):
    """
    Stores dataset metadata/embedding and the best-performing pipeline/model config discovered for it.

    This acts as a lightweight "config store" knowledge base:
      (dataset_features/embedding) -> best_config (+ best_model + metrics)
    """

    __tablename__ = "meta_learning_experiences"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=True)

    dataset_features = Column(JSON, nullable=False, default=dict)
    embedding = Column(JSON, nullable=False, default=list)  # list[float]

    best_config = Column(JSON, nullable=False, default=dict)
    best_model = Column(JSON, nullable=False, default=dict)
    best_metrics = Column(JSON, nullable=False, default=dict)

    source_cleaned_data_id = Column(Integer, ForeignKey("cleaned_data.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# Partitioning for RawData by sector and time
partition_by_sector_time = DDL("""
CREATE TABLE IF NOT EXISTS raw_data_y2023 PARTITION OF raw_data
    FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');
CREATE TABLE IF NOT EXISTS raw_data_y2024 PARTITION OF raw_data
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
""")

# Indexes for performance
Index('idx_sector_time', RawData.sector_id, RawData.uploaded_at)
Index('idx_cleaned_raw', CleanedData.raw_data_id)
Index('idx_prediction_sector', AIPrediction.sector_id)
Index('idx_feedback_user', FeedbackLog.user_id)
Index('idx_quality_cleaned', DataQualityScore.cleaned_data_id)
Index('idx_saved_cleaned_company', SavedCleanedDataset.company_id, SavedCleanedDataset.created_at)
Index('idx_profile_user', UserProfile.user_id)
Index('idx_pwreset_user', PasswordResetToken.user_id, PasswordResetToken.created_at)
Index('idx_pipeline_iter', PipelineIterationLog.company_id, PipelineIterationLog.task, PipelineIterationLog.created_at)
Index('idx_meta_exp_company', MetaLearningExperience.company_id, MetaLearningExperience.created_at)
Index('idx_meta_exp_sector', MetaLearningExperience.company_id, MetaLearningExperience.sector_id, MetaLearningExperience.created_at)


class SectorClassificationProfile(Base):
    """
    Meta-learning store for sector classification patterns (keywords learned per company/sector).
    """

    __tablename__ = "sector_classification_profiles"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    sector = Column(String(64), nullable=False)
    keywords = Column(JSON, nullable=False, default=list)  # list[str]
    samples = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)


Index('idx_sector_profile_company', SectorClassificationProfile.company_id, SectorClassificationProfile.updated_at)
Index('idx_sector_profile_unique', SectorClassificationProfile.company_id, SectorClassificationProfile.sector)
