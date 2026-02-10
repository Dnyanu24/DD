from sklearn.cluster import DBSCAN

def detect_unknown_data(df):
    numeric_df = df.select_dtypes(include="number")
    if numeric_df.empty:
        df["outlier"] = -1
        return df

    model = DBSCAN(eps=0.5, min_samples=5)
    df["outlier"] = model.fit_predict(numeric_df)
    return df
