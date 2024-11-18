import random
import uuid
from datetime import datetime, timedelta

interests = ["スポーツ", "音楽", "映画", "読書", "旅行", "料理", "ファッション", "テクノロジー", "アウトドア", "ゲーム"]
campaigns = ["キャンペーン1", "キャンペーン2"]
num_users = 100
num_items = 500


def generate_dummy_data():
    # 興味マスタ
    interest_master = [f"{i+1}\t{interest}" for i, interest in enumerate(interests)]

    # ユーザーマスタ
    user_master = []
    for _ in range(num_users):
        user_id = str(uuid.uuid4())
        gender = random.choice(["男性", "女性"])
        email = f"{user_id}@www.example.com"
        age = random.randint(18, 80)
        created_at = updated_at = datetime.now()
        user_master.append(f"{user_id}\t{email}\t{gender}\t{age}\t{created_at}\t{updated_at}")

    # アイテムマスタ
    item_master = []
    for i in range(num_items):
        item_name = f"アイテム{i+1}"
        category_id = random.randint(1, len(interests))
        price = random.randint(100, 1000)
        item_master.append(f"{i+1}\t{item_name}\t{price}\t{category_id}")

    # ユーザー興味
    user_interest = set()
    for user_id in [u.split("\t")[0] for u in user_master]:
        available_interests = list(range(1, len(interests) + 1))
        for _ in range(random.randint(1, 5)):
            if not available_interests:
                break
            interest_id = random.choice(available_interests)
            user_interest.add(f"{user_id}\t{interest_id}")
            available_interests.remove(interest_id)

    # キャンペーン
    campaign = []
    for i, c in enumerate(campaigns):
        campaign.append(f"{i+1}\t{c}")

    # 購買履歴（campaign_idを追加）
    purchase_history = []
    end_date = datetime.now()
    start_date = end_date - timedelta(days=365)
    for _ in range(1000):
        user_id = random.choice([u.split("\t")[0] for u in user_master])
        item_id = random.randint(1, num_items)
        purchase_date = start_date + timedelta(seconds=random.randint(0, int((end_date - start_date).total_seconds())))

        # 20%の確率でキャンペーンIDを付与、それ以外はNULL
        campaign_id = random.choice([str(random.randint(1, len(campaigns))), "\\N"]) if random.random() < 0.2 else "\\N"

        purchase_history.append(f"{user_id}\t{item_id}\t{campaign_id}\t{purchase_date.isoformat()}")

    return {
        "interest_master": interest_master,
        "user_master": user_master,
        "item_master": item_master,
        "user_interest": list(user_interest),
        "campaign": campaign,
        "purchase_history": purchase_history,
    }


# データの生成と保存
data = generate_dummy_data()
for table, rows in data.items():
    with open(f"{table}.tsv", "w") as f:
        for row in rows:
            f.write(f"{row}\n")

print("ダミーデータの生成が完了しました。")
