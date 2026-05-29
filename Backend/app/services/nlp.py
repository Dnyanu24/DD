import re
import string
from typing import Dict, List, Any, Tuple
import pandas as pd
import numpy as np
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer
from nltk.sentiment.vader import SentimentIntensityAnalyzer
from sklearn.feature_extraction.text import TfidfVectorizer
import nltk

nltk.download('punkt', quiet=True)
nltk.download('stopwords', quiet=True)
nltk.download('wordnet', quiet=True)
nltk.download('vader_lexicon', quiet=True)
nltk.download('omw-1.4', quiet=True)
nltk.download('averaged_perceptron_tagger', quiet=True)

stop_words = set(stopwords.words('english'))
lemmatizer = WordNetLemmatizer()
sia = SentimentIntensityAnalyzer()

class NLPPipeline:
    def __init__(self):
        self.vectorizer = TfidfVectorizer(max_features=1000, stop_words=None, ngram_range=(1,2))

    def tokenize(self, text: str) -> List[str]:
        """Tokenization with basic cleaning."""
        text = text.lower()
        text = re.sub(r'[^a-z\s]', '', text)
        tokens = word_tokenize(text)
        return [t for t in tokens if len(t) > 2 and t not in stop_words]

    def lemmatize(self, tokens: List[str]) -> List[str]:
        """Lemmatization."""
        return [lemmatizer.lemmatize(token) for token in tokens]

    def compute_tfidf_embeddings(self, texts: List[str]) -> np.ndarray:
        """TF-IDF vector embeddings."""
        if not texts:
            return np.array([])
        tfidf_matrix = self.vectorizer.fit_transform(texts)
        return tfidf_matrix.toarray()

    def sentiment_scoring(self, texts: List[str]) -> List[Dict[str, float]]:
        """Sentiment scoring per text (compound, pos, neu, neg)."""
        return [{'compound': sia.polarity_scores(t)['compound'],
                 'pos': sia.polarity_scores(t)['pos'],
                 'neu': sia.polarity_scores(t)['neu'],
                 'neg': sia.polarity_scores(t)['neg']} for t in texts]

    def basic_topic_modeling(self, tfidf_embeddings: np.ndarray, n_topics: int = 5) -> List[str]:
        """Simple topic extraction via top TF-IDF terms per cluster (placeholder)."""
        topics = []
        feature_names = self.vectorizer.get_feature_names_out()
        for i in range(min(n_topics, tfidf_embeddings.shape[0])):
            top_indices = np.argsort(tfidf_embeddings[i])[-5:][::-1]
            topic_terms = [feature_names[idx] for idx in top_indices]
            topics.append(' '.join(topic_terms))
        return topics

    def ner_extraction(self, text: str) -> List[str]:
        """Basic NER via POS tagging (placeholder for full NER)."""
        tokens = word_tokenize(text)
        pos_tags = nltk.pos_tag(tokens)
        entities = [token for token, pos in pos_tags if pos in ['NNP', 'NNPS']]
        return list(set(entities))[:10]  # Unique top entities

    def run_nlp_pipeline(self, df: pd.DataFrame, text_column: str = 'text') -> Dict[str, Any]:
        """

        Full Phase 3 Unstructured NLP Pipeline:
        1. Tokenization + noise/stopword removal
        2. Lemmatization
        3. TF-IDF vector embeddings
        4. Semantic analysis (via TF-IDF top terms)
        5. Sentiment scoring
        6. Topic modeling (TF-IDF clusters)
        7. NER

        Adds columns: tokens, lemmas, tfidf_embedding (JSON), sentiment (JSON), topics (JSON), ner (JSON)
        """
        if text_column not in df.columns:
            text_column = df.select_dtypes(include=['object']).columns[0]

        df_nlp = df.copy()
        texts = df_nlp[text_column].fillna('').astype(str).tolist()

        # 1-2: Tokenize + Lemmatize
        tokens_list = [self.tokenize(t) for t in texts]
        lemmas_list = [self.lemmatize(tokens) for tokens in tokens_list]
        df_nlp['tokens'] = tokens_list
        df_nlp['lemmas'] = lemmas_list

        # 3: TF-IDF Embeddings
        lemmas_text = [' '.join(lemmas) for lemmas in lemmas_list]
        embeddings = self.compute_tfidf_embeddings(lemmas_text)
        df_nlp['tfidf_embedding'] = [emb.tolist() for emb in embeddings]

        # 4-5: Semantic + Sentiment
        sentiments = self.sentiment_scoring(texts)
        df_nlp['sentiment'] = sentiments

        # 6: Topic Modeling
        topics = self.basic_topic_modeling(embeddings)
        df_nlp['topics'] = [topics[i % len(topics)] for i in range(len(df_nlp))]

        # 7: NER
        ner_list = [self.ner_extraction(t) for t in texts]
        df_nlp['ner'] = ner_list

        metrics = {
            'avg_sentiment_compound': np.mean([s['compound'] for s in sentiments]),
            'top_topics': topics[:5],
            'total_entities': sum(len(ner) for ner in ner_list)
        }

        return {
            'df': df_nlp,
            'metrics': metrics,
            'text_column_used': text_column
        }


# Usage in pipeline_controller:
# nlp_pipeline = NLPPipeline()
# nlp_result = nlp_pipeline.run_nlp_pipeline(df_unstructured)
# df_structured, df_nlp = await asyncio.gather(structured_pipeline(df), nlp_pipeline.run_nlp_pipeline(df))

