def clean_data(df):
    df = df.drop_duplicates()
    df = df.fillna(method="ffill")
    return df
