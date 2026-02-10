import spacy

nlp = spacy.load("en_core_web_sm")

def sector_classification(text: str):
    doc = nlp(text)
    nouns = [token.text.lower() for token in doc if token.pos_ == "NOUN"]
    return list(set(nouns))[:5]
