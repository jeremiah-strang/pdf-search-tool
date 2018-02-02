const fs = require('fs')
const path = require('path')
const remote = require('electron').remote
const app = remote.app
const currentWindow = remote.getCurrentWindow()
const $ = require('jquery')
const pdf_extract = require('pdf-extract')

/*
 * Extract text from a PDF file at the given file path (OCR)
 */
const getPdfText = filePath => {
  return new Promise((resolve, reject) => {
    const processor = pdf_extract(filePath, { type: 'ocr' }, error => {
      if (error) {
        return reject(error)
      }
    })
    processor.on('complete', data => {
      resolve(data.text_pages)
    })

    processor.on('error', error => {
      reject(error)
    })
  })
}

/*
 * Check if a file path is a directory
 */
const isDirectory = filePath => {
  return filePath &&
    typeof filePath === 'string' &&
    fs.existsSync(filePath) &&
    fs.lstatSync(filePath).isDirectory()
}

/*
 * Get a list of files from a folder (recursively searching subfolders)
 */
const getFiles = folder => {
  let files = fs.readdirSync(folder)
  let filesFound = []
  for (let file of files) {
    let filePath = folder + path.sep + file
    let fileLower = file.toLowerCase()
    if (isDirectory(filePath)) {
      filesFound = filesFound.concat(getFiles(filePath))
    } else if (fileLower.substring(fileLower.lastIndexOf('.'), fileLower.length) === '.pdf') {
      filesFound.push(filePath)
    }
  }
  return filesFound
}

/*
 * Main class
 */
class PdfSearchTool {

  /*
   * Initialize the tool, assigning event handlers
   */
  constructor () {
    this.searchTermInput = $('#search-term-input')
    this.folderInput = $('#folder-input')
    this.searchBtn = $('#search-btn')
    this.inputModal = $('#input-modal').show()
    this.resultsModal = $('#results-modal')
    this.folderPath = ''
    this.searchTerms = []
    this.filePaths = []
    this.currentFileNode = null

    this.searchTermInput.on('input', () => {
      this.searchTerms = this.searchTermInput.val().split(';').map(term => {
          return term.trim()
        }).filter(term => { return term.length > 0})
      this.inputChanged()
    })

    this.folderInput.change(() => {
      this.folderPath = this.folderInput[0].files[0].path
      this.inputChanged()
    })

    this.searchBtn.click(() => this.getResults())
  }

  /*
   * Generate the results
   */
  getResults () {
    this.resultsWrap = $('#results').empty()
    this.caseSensitive = $('#case-sensitive-chk').prop('checked')
    this.filePaths = getFiles(this.folderPath)
    this.currentFileNode = null

    if (!Array.isArray(this.filePaths) || this.filePaths.length === 0) {
      this.resultsWrap.append('<h4>No files found in folder ' + this.folderPath + '</h4>')
    } else {

      // create linked list for sequential traversal with async processing of each node
      const head = this.currentFileNode = {
        filePath: this.filePaths[0],
        next: null,
        previous: null,
      }

      if (this.filePaths.length > 1) {
        for (let i = 1; i < this.filePaths.length; i++) {
          const previous = this.currentFileNode
          previous.next = this.currentFileNode = {
            filePath: this.filePaths[i],
            next: null,
            previous: previous,
          }
        }
      }

      this.currentFileNode = head

      this.processNextFile(() => {
        // for future use - callback called when list traversal finishes
      })
    }
    this.resultsModal.show()
  }

  /*
   * Process the next file in the linked list of files to process
   */
  processNextFile (onComplete) {
    // base case - end of the linked list
    if (this.currentFileNode === null) {
      onComplete()
      return
    }

    const filePath = this.currentFileNode.filePath
    this.currentFileNode = this.currentFileNode.next
    if (filePath.substring(filePath.length - 4, filePath.length).toLowerCase() === '.pdf') {
      const fileHeader = $('<h4>' + filePath + '&nbsp;&nbsp;</h4>')
      const fileHeaderSpinner = $('<i class="fa fa-spinner fa-spin"></i>')
      fileHeader.append(fileHeaderSpinner)
      this.resultsWrap.append(fileHeader)
      const searchTermList = $('<ul></ul>')
      this.resultsWrap.append(searchTermList)
      getPdfText(filePath).then(data => {
        for (let term of this.searchTerms) {
          const li = $('<li>' + term + ': </li>')
          const spinner = $('<i class="fa fa-spinner fa-spin"></i>')
          searchTermList.append(li.append(spinner))
          let occurrences = 0
          for (let pageText of data) {
            if (!this.caseSensitive) {
              pageText = pageText.toLowerCase()
            }
            const re = this.caseSensitive ? new RegExp(term, 'g') : new RegExp(term.toLowerCase(), 'g')
            occurrences += (pageText.match(re) || []).length
          }
          if (occurrences > 0) {
            spinner.replaceWith('<span class="green-text">' + occurrences + ' occurrences</span>')
          } else {
            spinner.replaceWith('<span class="red-text">not found</span>')
          }
          fileHeaderSpinner.remove()
          this.processNextFile(onComplete)
        }
      }).catch(error => {
        console.error(error)
        fileHeaderSpinner.replaceWith('<span class="red-text">Error</span>')
        this.processNextFile(onComplete)
      })
    } else {
      this.processNextFile(onComplete)
    }
  }

  /*
   * Event fired when inputs are changed - determines if inputs are sufficient to generate results
   */
  inputChanged () {
    const folderInputEl = this.folderInput[0]
    const folderValid = !(
      !folderInputEl.files ||
      folderInputEl.files.length === 0 ||
      !fs.lstatSync(this.folderPath).isDirectory())
    this.searchBtn.prop('disabled', !folderValid || this.searchTerms.length === 0)
  }
}

new PdfSearchTool()
