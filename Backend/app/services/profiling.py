def profile_data(df):
    profile = {}
    for col in df.columns:
        profile[col] = {
            "dtype": str(df[col].dtype),
            "nulls": int(df[col].isnull().sum())
        }
    return profile
