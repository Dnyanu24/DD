from sklearn.cluster import KMeans

def product_clustering(df, k=3):
    numeric_df = df.select_dtypes(include="number")
    if numeric_df.empty:
        return df

    model = KMeans(n_clusters=k, random_state=42)
    df["cluster"] = model.fit_predict(numeric_df)
    return df
