const builder = require('botbuilder');
const express = require('express');
const app = express();

//=========================================================
// Bot Setup
//=========================================================

const port = process.env.port || process.env.PORT || 3000;
const server = app.listen(port, () => {
    console.log('bot is listening on port %s', port);
});

// Create chat bot
const connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});


const bot = new builder.UniversalBot(connector, session => {
    if (!session.conversationData[CityKey]) {
        session.conversationData[CityKey] = 'Seattle';
        session.send('Welcome to the Search City bot. I\'m currently configured to search for things in %s', session.conversationData[CityKey]);
    }
});

app.post('/api/messages', connector.listen());

//=========================================================
// Bots Dialogs
//=========================================================

// When user joins, it begin dialog
bot.on('conversationUpdate', message => {
    if (message.membersAdded) {
        message.membersAdded.forEach(identity => {
            if (identity.id === message.address.bot.id) {
                bot.beginDialog(message.address, '/buy');
            }
        });
    }
});

const firstChoices = {
    "いいランチのお店": {
        value: 'lunch',
        title: '行列のできるタイ料理屋',
        subtitle: 'ランチセットがコスパ良し',
        text: '品川駅から徒歩10分くらいのところにあるタイ料理屋。トムヤムクンヌードルがおすすめ。',
        imageURL: 'https://sakkuru.github.io/simple-bot-nodejs/images/tom.jpg',
        button: '予約する',
        url: 'http://example.com/'
    },
    "飲めるところ": {
        value: 'drink',
        title: '落ち着いた雰囲気の個室居酒屋',
        subtitle: 'なんでも美味しいが、特に焼き鳥がおすすめ',
        text: '品川駅から徒歩5分くらいの路地裏にひっそりある。',
        imageURL: 'https://sakkuru.github.io/simple-bot-nodejs/images/yaki.jpg',
        button: '予約する',
        url: 'http://example.com/'
    }
};

bot.dialog('/firstQuestion', [
    (session, results, next) => {
        builder.Prompts.choice(session, "何をお探しですか。", firstChoices, { listStyle: 3 });
    },
    (session, results, next) => {
        session.send('%sですね。', results.response.entity);
        session.send('こちらはいかがでしょうか。');

        const choice = firstChoices[results.response.entity];

        const card = new builder.HeroCard(session)
            .title(choice.title)
            .subtitle(choice.subtitle)
            .text(choice.text)
            .images([
                builder.CardImage.create(session, choice.imageURL)
            ])
            .buttons([
                builder.CardAction.openUrl(session, choice.url, choice.button)
            ]);

        const msg = new builder.Message(session).addAttachment(card);
        session.send(msg);
        session.beginDialog('/endDialog');
    }
]);

bot.dialog('/endDialog', [
    session => {
        builder.Prompts.confirm(session, "疑問は解決しましたか？", { listStyle: 3 });
    },
    (session, results) => {
        console.log(results.response);
        if (results.response) {
            session.send('ありがとうございました。');
            session.endDialog();

        } else {
            session.send('お役に立てず申し訳ありません。');
            session.beginDialog('/firstQuestion');
        }
    }
]);

// Mock
const catalog = {};
catalog.getPromotedItem = () => {
    return Promise.resolve({
        id: 'orange001',
        name: '美味しいみかん',
        currency: 'JPY',
        price: 1000,
        imageUrl: 'https://github.com/sakkuru/payment_with_bot/blob/gh-pages/images/orange.jpg?raw=true'
    });
};

const CartIdKey = 'DummyCartIdKey';
const cartId = 'DummyCartId';

const MicrosoftPayMethodName = 'https://pay.microsoft.com/microsoftpay';
const PaymentActionType = 'payment';

// PaymentRequest with default options
const createPaymentRequest = (cartId, product) => {

    // PaymentMethodData[]
    const paymentMethods = [{
        supportedMethods: [MicrosoftPayMethodName],
        data: {
            mode: process.env.PAYMENTS_LIVEMODE === 'true' ? null : 'TEST',
            merchantId: process.env.PAYMENTS_MERCHANT_ID,
            supportedNetworks: ['visa', 'mastercard'],
            supportedTypes: ['credit']
        }
    }];

    // PaymentDetails
    const paymentDetails = {
        total: {
            label: 'Total',
            amount: { currency: product.currency, value: product.price.toFixed(2) },
            pending: true
        },
        displayItems: [{
            label: product.name,
            amount: { currency: product.currency, value: product.price.toFixed(2) }
        }, {
            label: 'Shipping',
            amount: { currency: product.currency, value: '0.00' },
            pending: true
        }, {
            label: 'Sales Tax',
            amount: { currency: product.currency, value: '0.00' },
            pending: true
        }],
        // until a shipping address is selected, we can't offer shipping options or calculate taxes or shipping costs
        shippingOptions: []
    };

    // PaymentOptions
    const paymentOptions = {
        requestPayerName: true,
        requestPayerEmail: true,
        requestPayerPhone: true,
        requestShipping: true,
        shippingType: 'shipping'
    };

    // PaymentRequest
    return {
        id: cartId,
        expires: '1.00:00:00', // 1 day
        methodData: paymentMethods, // paymethodMethods: paymentMethods,
        details: paymentDetails, // paymentDetails: paymentDetails,
        options: paymentOptions // paymentOptions: paymentOptions
    };
}

bot.dialog('/buy', [
    session => {
        session.send("おすすめの品です。");

        catalog.getPromotedItem().then(product => {
            // Store userId for later, when reading relatedTo to resume dialog with the receipt.
            const cartId = product.id;
            session.conversationData[CartIdKey] = cartId;
            session.conversationData[cartId] = session.message.address.user.id;

            // Create PaymentRequest obj based on product information.
            const paymentRequest = createPaymentRequest(cartId, product);
            const buyCard = new builder.HeroCard(session)
                .title(product.name)
                .subtitle(product.price + product.currency)
                .text(product.description)
                .images([
                    new builder.CardImage(session).url(product.imageUrl)
                ])
                .buttons([
                    new builder.CardAction(session)
                    .title('Buy')
                    .type(PaymentActionType)
                    .value(paymentRequest)
                ]);

            session.send(new builder.Message(session)
                .addAttachment(buyCard));
        });
    }
]);