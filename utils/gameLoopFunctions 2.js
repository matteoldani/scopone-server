const {
  playerJoin,
  getCurrentPlayerById,
  getCurrentPlayerByUsername,
  playerLeave,
  getTablePlayer,
} = require("./players");

//oggetto che definsce la carte
var Carta = function (seme, valore) {
  var self = {
    seme: seme,
    valore: valore,
  };

  return self;
};

//crea il mazzo ordinato
var makeDeck = function () {
  var semi = ["H", "D", "S", "C"];
  var valori = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  var mazzo = [];

  var i,
    j,
    cont = 0;
  for (i = 0; i < semi.length; i++) {
    for (j = 0; j < valori.length; j++) {
      var c = Carta(semi[i], valori[j]);
      mazzo[cont] = c;
      cont++;
    }
  }
  return mazzo;
};

//estrae 40 numeri casuali diversi tra loro --> mischia il mazzo
var estrazioneCasuale = function () {
  var numeri = [];
  var i, j;
  var n;
  var trovato = false;

  for (j = 0; j < 40; j++) {
    n = Math.floor(Math.random() * 40) + 1;
    for (i = 0; i < numeri.length; i++) {
      if (numeri[i] == n) {
        trovato = true;
      }
    }
    if (trovato == false) {
      numeri[j] = n;
    } else {
      j--;
    }
    trovato = false;
  }

  return numeri;
};

//ordina la mano in ordine crescente
var ordinaMano = function (mano) {
  for (i = 0; i < mano.length; i++) {
    for (j = i + 1; j < mano.length; j++) {
      if (mano[i].valore > mano[j].valore) {
        var temp = mano[i];
        mano[i] = mano[j];
        mano[j] = temp;
      }
    }
  }

  return mano;
};

//la squadra avanza di un posto e si prepara per la mano successiva
var avanzaPosti = function (players) {
  var temp = players[0];
  for (var i = 0; i < 3; i++) {
    players[i] = players[i + 1];
  }
  players[3] = temp;
  return players;
};

var initGame = function (players) {
  var random = Math.floor(Math.random() * 4);
  var sockets = [];
  //ordino in base a un inizio casuale
  for (var i = 0; i < 4; i++) {
    sockets[i] = players[random % 4];
    random++;
  }
  //sistemo in modo che i posti siano t1-t2-t1-t2
  if (sockets[0].team == 0) {
    if (sockets[1].team == 0) {
      var temp = sockets[1];
      sockets[1] = sockets[2];
      sockets[2] = temp;
    } else if (sockets[2] == 1) {
      var temp = sockets[2];
      sockets[2] = sockets[3];
      sockets[3] = temp;
    }
  }

  if (sockets[0].team == 1) {
    if (sockets[1].team == 1) {
      var temp = sockets[1];
      sockets[1] = sockets[2];
      sockets[2] = temp;
    } else if (sockets[2] == 0) {
      var temp = sockets[2];
      sockets[2] = sockets[3];
      sockets[3] = temp;
    }
  }
  //sistemati
  return sockets;
};

module.exports = {
  estrazioneCasuale,
  initGame,
  makeDeck,
  ordinaMano,
  avanzaPosti,
};
