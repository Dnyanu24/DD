import pandas as pd
from app.services.data_cleaning import DataCleaningEngine
import json

# Build DataFrame similar to attachment
rows = [
    {'id':1,'name':'abc corp','sector':'it','sales':120000,'profit':None,'employee':50,'region':'west'},
    {'id':2,'name':'healthplus','sector':'healthcare','sales':85000,'profit':12000,'employee':None,'region':'north'},
    {'id':3,'name':'agrofarm','sector':'agriculture','sales':60000,'profit':8000,'employee':30,'region':'east'},
    {'id':4,'name':'finserve','sector':'finance','sales':150000,'profit':None,'employee':70,'region':None},
    {'id':5,'name':'technova','sector':'it','sales':None,'profit':15000,'employee':45,'region':'west'},
    {'id':6,'name':'medlife','sector':'healthcare','sales':90000,'profit':11000,'employee':40,'region':'south'},
    {'id':7,'name':'greengrow','sector':'agriculture','sales':52450,'profit':None,'employee':25,'region':'east'},
    {'id':8,'name':'safebank','sector':'finance','sales':130000,'profit':20000,'employee':None,'region':'north'},
    {'id':9,'name':'innotech','sector':'it','sales':140000,'profit':18000,'employee':60,'region':None},
    {'id':10,'name':'citycare','sector':'healthcare','sales':90000,'profit':None,'employee':35,'region':'west'},
]

df = pd.DataFrame(rows)

with open('Backend/test_user_input.json','w',encoding='utf-8') as f:
    f.write(df.to_json(orient='records'))

engine = DataCleaningEngine()
# Normal: choose mean/median automatically via strategy 'auto' uses numeric presence
normal = engine.impute_missing_values(df.copy(), strategy='auto', knn_k=3)
normal = engine.detect_outliers(normal)
normal = engine.correct_data_types(normal)

engine2 = DataCleaningEngine()
predictive = engine2.impute_missing_values(df.copy(), strategy='ml', knn_k=3)
predictive = engine2.detect_outliers(predictive)
predictive = engine2.correct_data_types(predictive)

out = {
    'input_preview': df.head(10).to_dict('records'),
    'normal_preview': normal.head(10).to_dict('records'),
    'predictive_preview': predictive.head(10).to_dict('records')
}

with open('Backend/test_user_case_output.json','w',encoding='utf-8') as f:
    json.dump(out,f,indent=2)

print('WROTE Backend/test_user_case_output.json')
