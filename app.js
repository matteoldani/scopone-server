//inizializzo il server express che verrà usato per le richieste di file tra client e server (le pagine e le foto)
var express = require("express");
var app = express();
var server = require("http").createServer(app);

const {
  playerJoin,
  getCurrentPlayerById,
  getCurrentPlayerByUsername,
  playerLeave,
  getTablePlayer,
} = require("./utils/players");

const {
  estrazioneCasuale,
  initGame,
  makeDeck,
  ordinaMano,
  avanzaPosti,
} = require("./utils/gameLoopFunctions");

var Tavolo = function () {
  var self = {
    socketsList: [],
    mani: [[], [], [], []],
    carte: [],
    prese1: [],
    prese2: [],
    scope1: [],
    scope2: [],
    campo: [],
    ultimapresa: 0,
    contatoreTurno: 1,
    players: [],
    puntiPrimoTeam: 0,
    puntiSecondoTeam: 0,
    index: 0,
  };
  return self;
};

var tavoli = {};
var mazzo = makeDeck();

//in questo modo non vengono processate query che richiedono le risorse a /server
//se la query è nulla viene richiamara la funzione

//se la query è con client viene mandata la risorsa
let port = process.env.PORT;
if (port == null || port == "") {
  port = 8081;
}

server.listen(port, () => console.log("server started"));

//inizializzo sockert.io che andrà inserito anche dentro l'index.html
var io = require("socket.io")(server, {});

io.on("connection", (socket) => {
  //join table
  socket.on("joinTable", ({ username, table }) => {
    if (tavoli[table] == null) {
      tavoli[table] = Tavolo();
    }
    currentPlayers = getTablePlayer(table);
    var controllo = 0;
    //controllo che il tavolo non sia pieno
    if (currentPlayers.length < 4) {
      //controllo che lo username nel tavolo non sia gia usato
      for (var i = 0; i < currentPlayers.length; i++) {
        if (username == currentPlayers[i].username) {
          controllo = 1;
          socket.emit("connectionError", {
            error: "username già usato nel tavolo",
          });
          break;
        }
      }
      if (!controllo) {
        const player = playerJoin(socket.id, username, table);
        console.log("IL PLAYER SI E' COLLEGATO \n", player.id);
        socket.join(player.table);

        io.to(player.table).emit("tablePlayers", {
          table: player.table,
          players: getTablePlayer(player.table),
        });
      }
    } else {
      socket.emit("connectionError", {
        error: "il tavolo è pieno",
      });
    }
  });

  //default disconnect when a player leaves the page
  socket.on("disconnect", () => {
    const player = playerLeave(socket.id);
    console.log("player disconnected", socket.id);

    var ps = null;

    if (player) {
      ps = getTablePlayer(player.table);

      // send users and room info
      io.to(player.table).emit("tablePlayers", {
        table: player.table,
        players: ps,
      });

      if (ps == null) {
        delete tavoli[player.table];
      } else {
        tavoli[player.table].players = ps;
      }
    }
  });

  //a player can change his team before the game
  socket.on("changeTeam", ({ username }) => {
    var player = getCurrentPlayerByUsername(username);
    if (player.team == 0) {
      player.team = 1;
    } else {
      player.team = 0;
    }

    io.to(player.table).emit("tablePlayers", {
      table: player.table,
      players: getTablePlayer(player.table),
    });
  });

  //starts the game
  socket.on("initGame", ({ username, table }) => {
    var players = getTablePlayer(table);
    if (players.length == 4) {
      players = initGame(players, io);
      tavoli[table].players = players;
      io.to(players[0].table).emit("gameIsStarting");
      giocaMano(table);
    }
  });

  socket.on("restartGame", ({ username, table }) => {
    if (tavoli[table].players.length == 4) {
      io.to(table).emit("gameRestarting");
    }

    tavoli[table].puntiPrimoTeam = 0;
    tavoli[table].puntiSecondoTeam = 0;
    tavoli[table].index = 0;
  });

  socket.on("card", ({ id, data }) => {
    onCard(socket, id, data);
  });

  socket.on("somma", ({ id, data, last }) => {
    somma(data, id, last);
  });

  socket.on("nextRound", ({ table }) => {
    io.to(table).emit("gameIsStarting");
    nextRound(table);
  });
});

var giocaMano = function (table) {
  //mischio il mazzo
  var numeri = estrazioneCasuale();

  // resetto variabili utili
  tavoli[table].contatoreTurno = 1;
  tavoli[table].mani = [[], [], [], []];
  tavoli[table].prese1 = [];
  tavoli[table].prese2 = [];
  tavoli[table].scope1 = [];
  tavoli[table].scope2 = [];
  tavoli[table].campo = [];
  tavoli[table].ultimaPresa = 0;

  //ASSEGNO LA MANO AD OGNI PLAYER
  for (var j = 0; j < 40; j += 10) {
    if (j == 0) {
      tavoli[table].players[j].isPlaying = 1;
    }
    for (var i = 0; i < 10; i++) {
      tavoli[table].mani[j / 10][i] = mazzo[numeri[i + j] - 1];
    }
    tavoli[table].mani[j / 10] = ordinaMano(tavoli[table].mani[j / 10]);
    console.log(j / 10);
    // console.log("mano: \n", mano);
    // console.log(mani);
    //players[j / 10].mano = mani[j / 10];
    io.to(tavoli[table].players[j / 10].id).emit("playerCards", {
      cards: tavoli[table].mani[j / 10],
    });
  }
  io.to(table).emit("tablePlayers", {
    table: table,
    players: getTablePlayer(table),
  });
  //salvo la lista dei socket dei giocatori
  for (var i = 0; i < 4; i++) {
    tavoli[table].socketsList[i] =
      io.sockets.connected[tavoli[table].players[i].id];
  }

  //variabili usate da tutti i socket e reimpostate a 0 ogni vola che un nuova carta è giocata
};

var onCard = function (scoekt, id, data) {
  var table = getCurrentPlayerById(id).table;

  var carte = tavoli[table].carte;
  var index = tavoli[table].index;
  var players = tavoli[table].players;
  var mani = tavoli[table].mani;
  var prese1 = tavoli[table].prese1;
  var prese2 = tavoli[table].prese2;
  var scope1 = tavoli[table].scope1;
  var scope2 = tavoli[table].scope2;
  var campo = tavoli[table].campo;
  var ultimaPresa = tavoli[table].ultimaPresa;
  var contatoreTurno = tavoli[table].contatoreTurno;

  var presa = 0;
  var somma = 0;
  var asso = 0;

  carte.splice(0, carte.length);

  console.log("Carta giocata: ", data);

  for (var j = 0; j < 4; j++) {
    if (players[j].id == id) {
      index = j;
      console.log(index);
      break;
    }
  }
  console.log(mani, data);

  console.log("Rimuovo la caera giocata dalla mano del giocatore");
  for (var i = 0; i < mani[index].length; i++) {
    console.log("qui");
    if (
      mani[index][i].valore == data.valore &&
      mani[index][i].seme == data.seme
    ) {
      console.log("dentro il primo if");
      mani[index].splice(i, 1); //elimino la carta giocata
      console.log(
        "la carta giocata era la numero: ",
        data,
        "la nuova mano è: ",
        mani[index]
      );
    }
  }
  io.to(players[index].id).emit("playerCards", { cards: mani[index] });

  if (data.valore == 1) {
    //se trovo l'asso aggiugo il campo alla presa e lo svuto
    console.log("e' stato giocato un asso");
    prese1.push(data);
    for (var i = 0; i < campo.length; i++) {
      if (index == 0 || index == 2) {
        prese1.push(campo[i]);
      } else {
        prese2.push(campo[i]);
      }

      console.log("aggiungo carte anche tra quelle da toglire dal campo");
      carte.push(campo[i]);
      if (index == 0 || index == 2) {
        ultimaPresa = 1;
      } else {
        ultimaPresa = 2;
      }
    }
    //svuoto il campo
    campo.splice(0, campo.length);
    asso = 1;
  }

  if (asso == 0) {
    console.log("controllo se la carta è in campo e posso prendere");
    for (var i = 0; i < campo.length; i++) {
      if (campo[i].valore == data.valore) {
        console.log("ho trovato una carta uguale, la prendo");
        if (index == 0 || index == 2) {
          prese1.push(campo[i]);
          prese1.push(data);
        } else {
          prese2.push(campo[i]);
          prese2.push(data);
        }
        campo.splice(i, 1);
        if (index == 0 || index == 2) {
          ultimaPresa = 1;
        } else {
          ultimaPresa = 2;
        }
        presa = 1;

        carte.push(campo[i]);
        carte.push(data);

        //svuoto l'array carte cos' da poterlo riuatilizzare
        carte.splice(0, carte.length);
        if (campo.length == 0) {
          if (index == 0 || index == 2) {
            scope1.push(data);
          } else {
            scope2.push(data);
          }

          console.log("ho anche fatto scopa");
        }
        /*
          console.log("questo è il campo prima dello splice: \n", campo);
          campo.splice(i, 1);
          console.log("ho eliminato la carta del campo: \n", campo);
          */
        break;
      }
    }

    //controllo le somme
    //prima guardo quante somme ci sono, se sono più di una è necessario far scegliere al giocatore
    if (presa == 0) {
      var sommeTriple = false;
      var contaSomme = 0;
      var tipoSommaTripla = 0; // 1/2 se è con la donna o con il re

      //verifico che non si ci sia una somma tripla possibile
      //some tripple 2+3+4 = 9 o 2+3+5 = 10
      if (data.valore == 9 || data.valore == 10) {
        //varibili di controllo
        var d = 0;
        var t = 0;
        var q = 0;
        var c = 0;
        for (var i = 0; i < campo.length; i++) {
          if (campo[i].valore == 2) {
            d = 1;
          }
          if (campo[i].valore == 3) {
            t = 1;
          }
          if (campo[i].valore == 4) {
            q = 1;
          }
          if (campo[i].valore == 5) {
            c = 1;
          }
        }
        if (d == 1 && t == 1) {
          if (q == 1 && data.valore == 9) {
            sommeTriple = true;
            tipoSommaTripla = 1;
          }

          if (c == 1 && data.valore == 10) {
            sommeTriple = true;
            tipoSommaTripla = 2;
          }
        }
      }

      //conto le somme doppie possibili
      for (var i = 0; i < campo.length; i++) {
        for (var j = i + 1; j < campo.length; j++) {
          if (campo[i].valore + campo[j].valore == data.valore) {
            //ho trovato una somma
            console.log("ho trovato una somma");
            contaSomme++;
          }
        }
      }

      //non ci sono prese
      if (contaSomme == 0 && !sommeTriple) {
        campo.push(data);
      }

      //c'è solo una somma possibile ed è somma classica
      if (contaSomme == 1 && !sommeTriple) {
        if (index == 0 || index == 2) {
          ultimaPresa = 1;
        } else {
          ultimaPresa = 2;
        }
        for (var i = 0; i < campo.length; i++) {
          for (var j = i + 1; j < campo.length; j++) {
            if (campo[i].valore + campo[j].valore == data.valore) {
              //ho trovato una somma
              if (index == 0 || index == 2) {
                prese1.push(campo[i]);
                prese1.push(campo[j]);
                prese1.push(data);
              } else {
                prese2.push(campo[i]);
                prese2.push(campo[j]);
                prese2.push(data);
              }

              console.log(
                "ho trovato una somma e aggiungo le due carte tra quelle da toglire"
              );
              carte.push(campo[i]);
              carte.push(campo[j]);

              campo.splice(j, 1);
              campo.splice(i, 1);
            }
          }
        }
      }

      //c'è solo una somma tripla
      if (contaSomme == 0 && sommeTriple) {
        if (index == 0 || index == 2) {
          ultimaPresa = 1;
        } else {
          ultimaPresa = 2;
        }
        if (tipoSommaTripla == 1) {
          if (index == 0 || index == 2) {
            prese1.push(data);
          } else {
            prese2.push(data);
          }

          for (var i = 0; i < campo.length; i++) {
            if (
              campo[i].valore == 2 ||
              campo[i].valore == 3 ||
              campo[i].valore == 4
            ) {
              if (index == 0 || index == 2) {
                prese1.push(campo[i]);
              } else {
                prese2.push(campo[i]);
              }

              carte.push(campo[i]);
              campo.splice(i, 1);
              i--;
            }
          }
        } else {
          if (index == 0 || index == 2) {
            prese1.push(data);
          } else {
            prese2.push(data);
          }

          for (var i = 0; i < campo.length; i++) {
            if (
              campo[i].valore == 2 ||
              campo[i].valore == 3 ||
              campo[i].valore == 5
            ) {
              if (index == 0 || index == 2) {
                prese1.push(campo[i]);
              } else {
                prese2.push(campo[i]);
              }

              carte.push(campo[i]);
              campo.splice(i, 1);
              i--;
            }
          }
        }
      }
      //ho più possibilità, faccio scegliere dal client
      //mando un messaggio generico
      if (contaSomme > 1 || (contaSomme == 1 && sommeTriple)) {
        io.to(id).emit("sommeMultiple");
        if (index == 0 || index == 2) {
          ultimaPresa = 1;
        } else {
          ultimaPresa = 2;
        }
        console.log("ho troavto più somme possibili");
        //aggiugo la carta gicoata alle prese, tanto una somma verrà scelta
        if (index == 0 || index == 2) {
          prese1.push(data);
        } else {
          prese2.push(data);
        }
      } else {
        if (contatoreTurno != 10) {
          if (index == 3) {
            contatoreTurno++;
          }
          players[(index + 1) % 4].isPlaying = 1;
          io.to(players[0].table).emit("tableCards", {
            campo: campo,
            lastPlayedCard: data,
          });
        } else {
          if (index == 3) {
            tavoli[table].carte = carte;
            tavoli[table].index = index;
            tavoli[table].players = players;
            tavoli[table].mani = mani;
            tavoli[table].prese1 = prese1;
            tavoli[table].prese2 = prese2;
            tavoli[table].scope1 = scope1;
            tavoli[table].scope2 = scope2;
            tavoli[table].campo = campo;
            tavoli[table].ultimaPresa = ultimaPresa;
            tavoli[table].contatoreTurno = contatoreTurno;
            endRound(prese1, prese2, id);
          } else {
            players[(index + 1) % 4].isPlaying = 1;
            io.to(players[0].table).emit("tableCards", {
              campo: campo,
              lastPlayedCard: data,
            });
          }
        }
      }
    } else {
      if (contatoreTurno != 10) {
        if (index == 3) {
          contatoreTurno++;
        }
        players[(index + 1) % 4].isPlaying = 1;
        io.to(players[0].table).emit("tableCards", {
          campo: campo,
          lastPlayedCard: data,
        });
      } else {
        if (index == 3) {
          tavoli[table].carte = carte;
          tavoli[table].index = index;
          tavoli[table].players = players;
          tavoli[table].mani = mani;
          tavoli[table].prese1 = prese1;
          tavoli[table].prese2 = prese2;
          tavoli[table].scope1 = scope1;
          tavoli[table].scope2 = scope2;
          tavoli[table].campo = campo;
          tavoli[table].ultimaPresa = ultimaPresa;
          tavoli[table].contatoreTurno = contatoreTurno;
          endRound(prese1, prese2, id);
        } else {
          players[(index + 1) % 4].isPlaying = 1;
          io.to(players[0].table).emit("tableCards", {
            campo: campo,
            lastPlayedCard: data,
          });
        }
      }
    }
  } else {
    console.log("ho giocato un asso e ora sono nel suo else");
    if (contatoreTurno != 10) {
      if (index == 3) {
        contatoreTurno++;
      }
      players[(index + 1) % 4].isPlaying = 1;
      io.to(players[0].table).emit("tableCards", {
        lastPlayedCard: data,
        campo: campo,
      });
    } else {
      if (index == 3) {
        tavoli[table].carte = carte;
        tavoli[table].index = index;
        tavoli[table].players = players;
        tavoli[table].mani = mani;
        tavoli[table].prese1 = prese1;
        tavoli[table].prese2 = prese2;
        tavoli[table].scope1 = scope1;
        tavoli[table].scope2 = scope2;
        tavoli[table].campo = campo;
        tavoli[table].ultimaPresa = ultimaPresa;
        tavoli[table].contatoreTurno = contatoreTurno;
        endRound(prese1, prese2, id);
      } else {
        players[(index + 1) % 4].isPlaying = 1;
        io.to(players[0].table).emit("tableCards", {
          campo: campo,
          lastPlayedCard: data,
        });
      }
    }
  }

  tavoli[table].carte = carte;
  tavoli[table].index = index;
  tavoli[table].players = players;
  tavoli[table].mani = mani;
  tavoli[table].prese1 = prese1;
  tavoli[table].prese2 = prese2;
  tavoli[table].scope1 = scope1;
  tavoli[table].scope2 = scope2;
  tavoli[table].campo = campo;
  tavoli[table].ultimaPresa = ultimaPresa;
  tavoli[table].contatoreTurno = contatoreTurno;

  console.log("sono arrivato in fondo, cambio il giocatore che deve gicoare");
  players[index].isPlaying = 0;
  io.to(players[index].table).emit("tablePlayers", {
    table: players[index].table,
    players: getTablePlayer(players[index].table),
  });

  console.log("prova fondo");
};

var endRound = function (prese1, prese2, id) {
  var table = getCurrentPlayerById(id).table;
  var prese1 = tavoli[table].prese1;
  var prese2 = tavoli[table].prese2;
  var scope1 = tavoli[table].scope1;
  var scope2 = tavoli[table].scope2;
  var ultimaPresa = tavoli[table].ultimaPresa;
  var puntiPrimoTeam = tavoli[table].puntiPrimoTeam;
  var puntiSecondoTeam = tavoli[table].puntiSecondoTeam;
  var campo = tavoli[table].campo;

  console.log("endRound raggiunto");
  var player = getCurrentPlayerById(id);
  console.log(id);
  io.to(player.table).emit("endRound");

  if (ultimaPresa == 1) {
    for (i in campo) {
      prese1.push(campo[i]);
    }
  } else {
    for (i in campo) {
      prese2.push(campo[i]);
    }
  }

  if (player.team == 1) {
    var data = {
      prese1: prese1,
      scope1: scope1,
      prese2: prese2,
      scope2: scope2,
    };
  } else {
    var data = {
      prese1: prese2,
      scope1: scope2,
      prese2: prese1,
      scope2: scope1,
    };
  }

  //invio le prese fatta dalle diverse squadre con le rispettive scope
  io.to(player.table).emit("prese", { data: data });

  //CONTEGGIO DEI PUNTI

  var punti1 = 0;
  var punti2 = 0;

  //carte
  if (prese1.length > prese2.length) {
    punti1++;
    console.log("carte di squadra 1 con: ", prese1.length);
  } else {
    if (prese1.length < prese2.length) {
      punti2++;
      console.log("carte di squadra 2 con: ", prese2.length);
    }
  }
  //fine carte

  //setteBello
  for (var i in prese1) {
    if (prese1[i].valore == 7 && prese1[i].seme == "D") {
      punti1++;
      console.log("settebello della squadra 1 in posizione: ", i);
      console.log("controllo: ", prese1[i]);
    }
  }

  for (var i in prese2) {
    if (prese2[i].valore == 7 && prese2[i].seme == "D") {
      punti2++;
      console.log("settebello della squadra 2 in posizione: ", i);
      console.log("controllo: ", prese2[i]);
    }
  }
  //fine settebello

  //primiera
  var sette = [0, 0, 0, 0];
  var sei = [0, 0, 0, 0];
  var asso = [0, 0, 0, 0];
  var cinque = [0, 0, 0, 0];

  var sette2 = [0, 0, 0, 0];
  var sei2 = [0, 0, 0, 0];
  var asso2 = [0, 0, 0, 0];
  var cinque2 = [0, 0, 0, 0];

  var totale = [0, 0, 0, 0];
  var totale2 = [0, 0, 0, 0];

  var semi = ["H", "D", "C", "S"];
  var semiEsclusione = semi;

  for (i in prese1) {
    if (prese1[i].valore == 7) {
      if (prese1[i].seme == "H") {
        sette[0] = 21;
      }
      if (prese1[i].seme == "D") {
        sette[1] = 21;
      }
      if (prese1[i].seme == "S") {
        sette[2] = 21;
      }
      if (prese1[i].seme == "C") {
        sette[3] = 21;
      }
    }
    if (prese1[i].valore == 6) {
      if (prese1[i].seme == "H") {
        sei[0] = 18;
      }
      if (prese1[i].seme == "D") {
        sei[1] = 18;
      }
      if (prese1[i].seme == "S") {
        sei[2] = 18;
      }
      if (prese1[i].seme == "C") {
        sei[3] = 18;
      }
    }
    if (prese1[i].valore == 1) {
      if (prese1[i].seme == "H") {
        asso[0] = 16;
      }
      if (prese1[i].seme == "D") {
        asso[1] = 16;
      }
      if (prese1[i].seme == "S") {
        asso[2] = 16;
      }
      if (prese1[i].seme == "C") {
        asso[3] = 16;
      }
    }
    if (prese1[i].valore == 5) {
      if (prese1[i].seme == "H") {
        cinque[0] = 15;
      }
      if (prese1[i].seme == "D") {
        cinque[1] = 15;
      }
      if (prese1[i].seme == "S") {
        cinque[2] = 15;
      }
      if (prese1[i].seme == "C") {
        cinque[3] = 15;
      }
    }
  }

  for (i in prese2) {
    if (prese2[i].valore == 7) {
      if (prese2[i].seme == "H") {
        sette2[0] = 21;
      }
      if (prese2[i].seme == "D") {
        sette2[1] = 21;
      }
      if (prese2[i].seme == "S") {
        sette2[2] = 21;
      }
      if (prese2[i].seme == "C") {
        sette2[3] = 21;
      }
    }
    if (prese2[i].valore == 6) {
      if (prese2[i].seme == "H") {
        sei2[0] = 18;
      }
      if (prese2[i].seme == "D") {
        sei2[1] = 18;
      }
      if (prese2[i].seme == "S") {
        sei2[2] = 18;
      }
      if (prese2[i].seme == "C") {
        sei2[3] = 18;
      }
    }
    if (prese2[i].valore == 1) {
      if (prese2[i].seme == "H") {
        asso2[0] = 16;
      }
      if (prese2[i].seme == "D") {
        asso2[1] = 16;
      }
      if (prese2[i].seme == "S") {
        asso2[2] = 16;
      }
      if (prese2[i].seme == "C") {
        asso2[3] = 16;
      }
    }
    if (prese2[i].valore == 5) {
      if (prese2[i].seme == "H") {
        cinque2[0] = 15;
      }
      if (prese2[i].seme == "D") {
        cinque2[1] = 15;
      }
      if (prese2[i].seme == "S") {
        cinque2[2] = 15;
      }
      if (prese2[i].seme == "C") {
        cinque2[3] = 15;
      }
    }
  }

  var controlloZeri = 0;
  var controlloZeri2 = 0;

  for (i in totale) {
    totale[i] = sette[i] + sei[i] + asso[i] + cinque[i];
    if (totale[i] == 0) {
      controlloZeri++;
    }
    totale2[i] = sette2[i] + sei2[i] + asso2[i] + cinque2[i];
    if (totale2[i] == 0) {
      controlloZeri2++;
    }
  }

  if (controlloZeri == 0 && controlloZeri2 == 0) {
    if (
      totale[0] + totale[1] + totale[2] + totale[3] >
      totale2[0] + totale2[1] + totale2[2] + totale2[3]
    ) {
      punti1++;
      console.log("la squadra 1 ha fatto la primiera");
    } else {
      if (
        totale[0] + totale[1] + totale[2] + totale[3] <
        totale2[0] + totale2[1] + totale2[2] + totale2[3]
      ) {
        punti2++;
        console.log("la squadra 2 ha fatto la primiera");
      } else {
        console.log("la primiera è pari");
      }
    }
  } else {
    if (controlloZeri == 0 && controlloZeri2 != 0) {
      punti1++;
      console.log("la squadra 1 ha fatto la primiera");
    } else {
      if (controlloZeri != 0 && controlloZeri2 == 0) {
        punti2++;
        console.log("la squadra 2 ha fatto la primiera");
      } else {
        if (
          totale[0] + totale[1] + totale[2] + totale[3] >
          totale2[0] + totale2[1] + totale2[2] + totale2[3]
        ) {
          punti1++;
          console.log("la squadra 1 ha fatto la primiera");
        } else {
          if (
            totale[0] + totale[1] + totale[2] + totale[3] <
            totale2[0] + totale2[1] + totale2[2] + totale2[3]
          ) {
            punti2++;
            console.log("la squadra 2 ha fatto la primiera");
          } else {
            console.log("la primiera è pari");
          }
        }
      }
    }
  }
  //fine primiera

  //aggiungo le scope
  punti1 += scope1.length;
  punti2 += scope2.length;
  // fine aggiunta scope

  //ori
  var cont = 0;
  for (i in prese1) {
    if (prese1[i].seme == "D") {
      cont++;
    }
  }
  if (cont > 5) {
    console.log("la prima squadra ha fatto ori");
    punti1++;
  } else {
    if (cont < 5) {
      console.log("la seconda squadra ha fatto ori");
      punti2++;
    }
  }
  //fine ori

  //napola
  console.log("sto calcolando la napola della prima squadra");
  var napola = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (i in prese1) {
    console.log("carta: ", prese1[i].valore, " seme: ", prese1[i].seme);
    if (prese1[i].seme == "D") {
      napola[prese1[i].valore - 1] = 1;
    }
  }
  console.log("questa è la napola fatta dalla prima squadra: ", napola);
  cont = 0;
  i = 0;
  var trovato = false;
  while (!trovato) {
    if (napola[i] == 1) {
      cont++;
    } else {
      trovato = 1;
    }
    i++;
  }
  if (cont >= 3) {
    punti1 += cont;
  }
  if (cont == 10) {
    //riorda che il player che ha chaimato end game è sempre l'ultimo
    //se l'ultimo ha come team 0 vuol dire che siamo nel caso scambiato dove i punti1 dovrebbero andare alla squadra due e vicevera

    if (player.team == 1) {
      puntiPrimoTeam = 100000;
    } else {
      puntiSecondoTeam = 10000;
    }
  }

  napola = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (i in prese2) {
    if (prese2[i].seme == "D") {
      napola[prese2[i].valore - 1] = 1;
    }
  }
  console.log("questa è la napola fatta dalla seconda squadra: ", napola);
  cont = 0;
  i = 0;
  trovato = false;
  while (!trovato) {
    if (napola[i] == 1) {
      cont++;
    } else {
      trovato = 1;
    }
    i++;
  }
  if (cont >= 3) {
    punti2 += cont;
  }
  if (cont == 10) {
    if (player.team == 1) {
      puntiSecondoTeam = 100000;
    } else {
      puntiPrimoTeam = 10000;
    }
  }

  //CODICE NUOVO PER SIMULARE UN INTERA partita
  var player = getCurrentPlayerById(id);
  if (player.team == 1) {
    puntiPrimoTeam += punti1;
    puntiSecondoTeam += punti2;
  } else {
    puntiPrimoTeam += punti2;
    puntiSecondoTeam += punti1;
  }

  io.to(player.table).emit("punti", {
    puntiPrimoTeam: puntiPrimoTeam,
    puntiSecondoTeam: puntiSecondoTeam,
  });

  if (puntiPrimoTeam >= 21) {
    if (puntiSecondoTeam < 21) {
      //vince la parita la squadra 1;
      console.log("ha vinto il primo team");
      io.to(table).emit("winners", {
        team: 0,
      });
    } else {
      if (puntiPrimoTeam > puntiSecondoTeam) {
        //vince la partita la squadra 1;
        console.log("ha vinto il primo team");

        io.to(table).emit("winners", {
          team: 0,
        });
      } else {
        //vince squadra 2;
        console.log("ha vinto il primo team");

        io.to(table).emit("winners", {
          team: 1,
        });
      }
    }
  } else if (puntiSecondoTeam >= 21) {
    //vince squadra 2;
    console.log("ha vinto il primo team");

    io.to(table).emit("winners", {
      team: 1,
    });
  }

  tavoli[table].prese1 = prese1;
  tavoli[table].prese2 = prese2;
  tavoli[table].scope1 = scope1;
  tavoli[table].scope2 = scope2;
  tavoli[table].ultimaPresa = ultimaPresa;
  tavoli[table].puntiPrimoTeam = puntiPrimoTeam;
  tavoli[table].puntiSecondoTeam = puntiSecondoTeam;
  tavoli[table].campo = campo;
};

var somma = function (data, id, last) {
  var table = getCurrentPlayerById(id).table;

  var carte = tavoli[table].carte;
  var index = tavoli[table].index;
  var players = tavoli[table].players;

  var prese1 = tavoli[table].prese1;
  var prese2 = tavoli[table].prese2;

  var campo = tavoli[table].campo;

  var contatoreTurno = tavoli[table].contatoreTurno;

  for (var j in data) {
    for (var i = 0; i < campo.length; i++) {
      if (campo[i].valore == data[j].valore && campo[i].seme == data[j].seme) {
        if (index == 0 || index == 2) {
          prese1.push(campo[i]);
          carte.push(campo[i]);
          campo.splice(i, 1);
        } else {
          prese2.push(campo[i]);
          carte.push(campo[i]);
          campo.splice(i, 1);
        }
      }
    }
  }

  //mando il campo da disegnare
  var player = getCurrentPlayerById(id);
  io.to(player.table).emit("tableCards", {
    campo: campo,
    lastPlayedCard: last,
  });
  carte.splice(0, carte.length);

  if (contatoreTurno != 10) {
    if (index == 3) {
      contatoreTurno++;
    }
    players[(index + 1) % 4].isPlaying = 1;
    io.to(player.table).emit("tablePlayers", {
      table: player.table,
      players: getTablePlayer(player.table),
    });
  } else {
    //se il contatore dei turni è uguale a 10 vuol dir e che era l'ultima mano, chiamo la fine del gico
    if (index == 3) {
      tavoli[table].carte = carte;
      tavoli[table].index = index;
      tavoli[table].players = players;

      tavoli[table].prese1 = prese1;
      tavoli[table].prese2 = prese2;

      tavoli[table].campo = campo;

      tavoli[table].contatoreTurno = contatoreTurno;

      endRound(prese1, prese2, id);
    } else {
      players[(index + 1) % 4].isPlaying = 1;
      io.to(player.table).emit("tablePlayers", {
        table: player.table,
        players: getTablePlayer(player.table),
      });
    }
  }

  tavoli[table].carte = carte;
  tavoli[table].index = index;
  tavoli[table].players = players;

  tavoli[table].prese1 = prese1;
  tavoli[table].prese2 = prese2;

  tavoli[table].campo = campo;

  tavoli[table].contatoreTurno = contatoreTurno;
};

var nextRound = function (table) {
  tavoli[table].socketsList = avanzaPosti(tavoli[table].socketsList);
  tavoli[table].players = avanzaPosti(tavoli[table].players);

  giocaMano(table);
};

/*
message tablePlayer sends the object 'player' to evreyone
message tableCards semds the object 'campo' and the last played card to evreone
message playerCards sends the hand of a specific player only to his clinet
*/

//react spring per le animazioni
