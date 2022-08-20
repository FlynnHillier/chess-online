import { Board,Perspective, Piece,Tile,Coordinate} from "./types"
import TileObject from "./tile";

import Bishop from "./bishop";
import Rook from "./rook";
import Queen from "./queen";

export class ChessBoard implements Board {
    initialised = false
    tileMap: Tile[] = []
    rowLength = -1
    activePieces: Piece[] = []

    currentTurn : Perspective = "white"

    forVisionUpdateOnEveryMove : Piece[] = []

    checkInfo : { 
        white: { status: "none" | "check" | "checkmate"; threateningPieces: { piece: Piece; alongPath: Coordinate[]; }[]; }
        black:{ status: "none" | "check" | "checkmate"; threateningPieces: { piece: Piece; alongPath: Coordinate[]; }[]; }
    } = {
        white: { 
            status: "none", 
            threateningPieces: [] 
        },
        black: { 
            status: "none", 
            threateningPieces: [] 
        }
    }
    king : {white:Piece| null, black:Piece | null} = {
        white:null,
        black:null
    }
    captured: { white: Piece[]; black: Piece[] } = {
        white:[],
        black:[]
    }



    constructor(public perspective:Perspective){}

    init({pieceMap = [null,null,null,null,new Rook(this,"white"),null,null,null,null] ,tilesPerRow = 3} : {pieceMap?:(Piece | null)[],tilesPerRow?:number} = {}) {

        if(pieceMap.length % tilesPerRow !== 0){
            throw Error(`invalid pieceMap provided for rowLength of '${tilesPerRow}', pieceMap must be of a length that is an exact multiple of provided rowLength.`)
        }

        let kingPresence ={
            white:false,
            black:false
        }

        this.rowLength = tilesPerRow
        this.forVisionUpdateOnEveryMove = []

        let piecesForInit : Piece[] = []

        for(let index = 0; index < pieceMap.length; index++){
            const piece = pieceMap[index]
            if(piece !== null){
                this.activePieces.push(piece)
                if(piece.species === "king"){
                    if(kingPresence[piece.perspective]){
                        throw Error(`invalid game setup - only one king per perspective is allowed. ${piece.perspective} perspective has more than one.`)
                    }
                    kingPresence[piece.perspective] = true
                    this.king[piece.perspective] = piece
                }
                piecesForInit.push(piece)
                if(piece._pathingCharacteristics.isOnlyMovableToSafeTiles){
                    this.forVisionUpdateOnEveryMove.push(piece)
                }
            }

            if(index < this.rowLength){ //if tile is within first row
                this.tileMap.push(new TileObject(piece,"white"))
            } else if(index >= pieceMap.length - this.rowLength) { //if tile is within last row
                this.tileMap.push(new TileObject(piece,"black"))
            } else{
                this.tileMap.push(new TileObject(piece,false))
            }
        }

        if(!kingPresence.white || !kingPresence.black){
            throw Error(`invalid game setup - both perspectives must have a king.`)
        }

        for(let piece of piecesForInit){
            this._initialisePiece(piece)
        }

        for(let piece of this.forVisionUpdateOnEveryMove){
            this._initialisePiece(piece,{isSecondInit:true})
        }

        this.checkForPins()

        if(this.isCheck("white") || this.isCheck("black")){
            throw Error("either side cannot begin in check")
        }

        this.initialised = true
    }

    onPieceMove(piece: Piece,moveTo:Coordinate): void {
        let originTile = this.getTile(piece.location) as Tile
        let targetTile = this.getTile(moveTo)
        let excludeFromUpdate : Piece[] = [piece]

        originTile.occupant = null

        if(targetTile.occupant !== null){ //capture piece in target location
            excludeFromUpdate.push(targetTile.occupant)
            this.capturePiece(targetTile.occupant)
        }

        targetTile.occupant = piece //move to destination tile



        if(this.checkInfo[this.currentTurn].status === "check"){
            this.onNoLongerCheck(this.currentTurn)
        }

        const piecesForUpdate : Piece[] =  this._ConcatUnique(targetTile.inVisionOf,originTile.inVisionOf,excludeFromUpdate)  //targetTile.inVisionOf.concat(originTile.inVisionOf)

        targetTile.inVisionOf = []
        originTile.inVisionOf = []

        piece.location = moveTo
        piece.update()

        for(let anotherPiece of piecesForUpdate){ //updates vision of all affected tiles by the move at hand
            anotherPiece.update()
        }

        if(piece.species === "pawn" && targetTile.willUpgradePawns === piece.perspective){
            this.upgradePawn(piece)
        }

        this.updateMoveToSafeTileOnlyPieces()

        this.checkForPins()

        this.changeTurn()
    }

    upgradePawn(pawn:Piece){
        const replacementPiece = new Queen(this,pawn.perspective)
        this.activePieces.splice(this.activePieces.indexOf(pawn),1) //remove pawn from active pieces
        replacementPiece.location = pawn.location
        replacementPiece.initialised = true
        this.getTile(pawn.location).occupant = replacementPiece
        this.activePieces.push(replacementPiece)
        replacementPiece.update()
    }


    updateMoveToSafeTileOnlyPieces() : void{
        for (let piece of this.forVisionUpdateOnEveryMove){
            if(!piece.captured){
                piece.update()
            }
        }

        for (let piece of this.forVisionUpdateOnEveryMove){
            if(!piece.captured){
                piece.update()
            }
        }
    }

    checkForPins() : void {
        for(let piece of this.activePieces){
            const pinnedBy = piece.getPinnedBy()
            piece.pinnedBy = pinnedBy

            if(piece.pinnedBy.length !== 0){
                piece.isPinned = true
                piece.update()
            } else{
                if(piece.isPinned === true){
                    piece.isPinned = false
                    piece.update()
                }
            }
        }
    }

    capturePiece(piece:Piece) : void {
        this.getTile(piece.location).occupant === null
        this.captured[piece.perspective === "white" ? "black" : "white"].push(piece)
        for(let location of piece.inVision){
            this.getTile(location).onNoLongerInVisionOf(piece)
        }

        this.activePieces.splice(this.activePieces.indexOf(piece),1)

        piece.onCaptured()
    }

    isCheck(perspective:Perspective) : boolean{
        const threateningPieces : Piece[] = this.getTile(this.king[perspective]!.location).inVisionOf.filter(piece => piece.perspective !== perspective)
        return threateningPieces.length !== 0
    }

    isCheckMateOnCheck(perspective:Perspective) : boolean{
        const relevantKing : Piece = this.king[perspective] as Piece
        const threateningPieces : Piece[] = this.getTile(this.king[perspective]!.location).inVisionOf.filter(piece => piece.perspective !== perspective)

        if(relevantKing.movableTo.length !== 0) {
            return false
        }

        if(threateningPieces.length === 1){ //friendly pieces may be able to move to block said piece
            const threateningVector = threateningPieces[0].isRelatingVector(relevantKing).vector
            for(let location of threateningPieces[0].walk(threateningVector,{steps:threateningPieces[0]._pathingCharacteristics.steps}).inVision.concat([threateningPieces[0].location])){ //for location in threatening path of piece that threatens king (check for friendly pieces that can move to block its path)
                for(let friendlyPiece of this.getTile(location).inVisionOf.filter(piece => piece.perspective === perspective)){ //for friendly piece that can see see the tile in question
                    if(friendlyPiece.movableTo.some(movableTo=> location.every((val,indx) => val === movableTo[indx]))){ //if friendly piece is allowed to move to this tile
                        return false
                    }
                }
            }
        }
        
        return true
    }

    onNoLongerCheck(perspective:Perspective) : void {

        console.log(`${perspective} is no longer in check`)

        this.checkInfo[perspective] = {...this.checkInfo[perspective],status:"none",threateningPieces:[]}
        
        for(let friendlyPiece of this.activePieces.filter(piece => piece.perspective === this.currentTurn)){
            friendlyPiece.update()
        }
    }

    onCheck(perspective:Perspective) : void{
        console.log(`${perspective} is in check`)

        if(this.isCheckMateOnCheck(perspective)){
            this.onCheckMate(perspective)
            return
        }


        this.checkInfo[perspective] = {...this.checkInfo[perspective],status:"check",threateningPieces:[]}

        const threateningPieces : Piece[] = this.getTile(this.king[perspective]!.location).inVisionOf.filter(piece => piece.perspective !== perspective) //all pieces that threaten the king
        for(let threat of threateningPieces){
            const relevantThreatVector = threat.isRelatingVector(this.king[perspective]!).vector
            const threatPath = threat.walk(relevantThreatVector,{steps:threat._pathingCharacteristics.steps}).inVision
            this.checkInfo[perspective].threateningPieces.push({
                piece:threat,
                alongPath:threatPath
            })
        }

        for(let friendlyPiece of this.activePieces.filter(piece => piece.perspective === perspective)){
            friendlyPiece.update()
        }
    }

    onCheckMate(perspective:Perspective) : void{
        console.log(`${perspective} has been checkmated!`)
    }

    changeTurn() : void {
        this.currentTurn = this.currentTurn === "white" ? "black" : "white"
        this.onTurnChange()
    }

    onTurnChange() : void {
        console.log(this.currentTurn)

        if(this.isCheck(this.currentTurn)){
            this.onCheck(this.currentTurn)
        }

    }

    tileIsInVisionOfPerspective(tile:Tile,perspective:Perspective) : boolean{
        for(let piece of tile.inVisionOf){
            if(piece.perspective === perspective){
                return true
            }
        }
        return false
    }

    tileDoesExist(location:Coordinate){
        if(location[0] < 0 || location[1] < 0){
            return false
        }

        return (location[0] < this.rowLength  && location[1] < Math.floor(this.tileMap.length / this.rowLength)) 
    }

    getTile(location: Coordinate): Tile{
        return this.tileMap[this._coordinateToIndex(location)]
    }


    _initialisePiece(piece:Piece,{isSecondInit = false}:{isSecondInit?:boolean} = {}) : void{
        piece.location = this._generatePieceLocation(piece)
        piece.update()
        if(!(piece._pathingCharacteristics.isOnlyMovableToSafeTiles === true && isSecondInit === false)){
            piece.initialised = true
        }
    }

    _generatePieceLocation(piece:Piece) : [number,number]{
        const matchingTile = this.tileMap.find((tile)=>piece === tile.occupant)

        if(!matchingTile){
            throw {
                message:"on _generatePieceLocation() could not locate piece within tileMap",
                piece:piece
            }
        }

        const tileIndex = this.tileMap.indexOf(matchingTile)

        return this._indexToCoordinate(tileIndex)
    }

    _indexToCoordinate(index:number) : Coordinate {
        return [index % this.rowLength,Math.floor(index / this.rowLength)]
    }

    _coordinateToIndex(coordinate:Coordinate) : number {
        if(coordinate[0] < 0 || coordinate[1] < 0){
           throw Error(`cannot convert coordinate of negative indexes to a valid index: Coordinate: [${coordinate[0]},${coordinate[1]}] `)
        }

        return (coordinate[1] * this.rowLength) + coordinate[0]
    }

    _ConcatUnique(array_one:Array<any>, array_two:Array<any>,exclude? : Array<any>){
        
        for(let elem of array_one){
            if(exclude?.includes(elem)){
                array_one.splice(array_one.indexOf(elem),1)
            }
        }
        for(let elem of array_two){
            if(exclude?.includes(elem)){
                continue
            }
            if(!array_one.includes(elem)){
                array_one.push(elem)
            }
        }
        return array_one
    }
}

export default ChessBoard