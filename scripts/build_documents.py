import pandas as pd
import json
from pathlib import Path

documents = []

# ---------- PRODUCTS DATASET ----------

products_path = "data/raw/skincare_products_clean.csv"

df_products = pd.read_csv(products_path)

df_products = df_products.fillna("")

for _, row in df_products.iterrows():

    text = f"""
    Product: {row.to_dict()}
    """

    documents.append({
        "text": text,
        "metadata": {
            "source": "products"
        }
    })

# ---------- INGREDIENTS DATASET ----------

ingredients_path = "data/raw/ingredientsList.csv"

df_ingredients = pd.read_csv(ingredients_path)

df_ingredients = df_ingredients.fillna("")

for _, row in df_ingredients.iterrows():

    text = f"""
    Ingredient Info: {row.to_dict()}
    """

    documents.append({
        "text": text,
        "metadata": {
            "source": "ingredients"
        }
    })

# ---------- TREATMENTS DATASET ----------

treatment_path = "data/raw/Skincare Treatment Dataset.csv"

df_treatment = pd.read_csv(treatment_path)

df_treatment = df_treatment.fillna("")

for _, row in df_treatment.iterrows():

    text = f"""
    Treatment Info: {row.to_dict()}
    """

    documents.append({
        "text": text,
        "metadata": {
            "source": "treatments"
        }
    })

# ---------- SAVE ----------

output_dir = Path("data/processed")
output_dir.mkdir(parents=True, exist_ok=True)

output_file = output_dir / "documents.json"

with open(output_file, "w", encoding="utf-8") as f:
    json.dump(documents, f, indent=2)

print(f"Saved {len(documents)} documents.")